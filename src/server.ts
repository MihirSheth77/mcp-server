import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { queryOpenStreetMap } from './tools/openstreetmap';
import { z } from 'zod'; // Import zod for schema definition

// Load environment variables from .env file
dotenv.config();
console.log("[Server Startup] dotenv configured.");

const app = express();
const port = process.env.PORT || 3000;
console.log(`[Server Startup] Port configured: ${port}`);

// Store the transport associated with the session ID
const transports: { [sessionId: string]: SSEServerTransport } = {};
console.log("[Server Startup] Transport map initialized.");

// --- Middleware Setup ---

// Enable Cross-Origin Resource Sharing (CORS) for all origins
// This is often necessary for web clients (like chat interfaces) hosted on different domains
app.use(cors());
console.log("[Server Startup] CORS middleware enabled.");

// Parse incoming JSON requests
app.use(express.json());
console.log("[Server Startup] JSON parsing middleware enabled.");

// --- Route Definitions ---

// Health check endpoint
// Responds with 200 OK if the server is running
// Useful for deployment platforms (like App Runner) to verify service health
app.get('/health', (req, res) => {
  console.log("[Health Check] Received request");
  res.status(200).send('OK');
});

// SSE endpoint for MCP connections
// Handles the Model Context Protocol handshake and communication over Server-Sent Events
app.get('/sse', async (req, res) => {
  console.log("[SSE Connection] New connection requested");

  // Set necessary headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream'); // Indicates SSE stream
  res.setHeader('Cache-Control', 'no-cache'); // Prevents caching of the stream
  res.setHeader('Connection', 'keep-alive'); // Keeps the connection open
  // res.flushHeaders(); // Comment out - Let the transport manage when headers are sent
  console.log("[SSE Connection] Headers set for event stream");

  // Create a new MCP server instance for this connection
  const server = new McpServer({
    name: "openstreetmap-mcp-server",
    version: "1.0.0",
    // Don't include tools in the constructor - we'll register them explicitly
  });
  
  // Register the tool explicitly using server.tool() method with Zod schema
  server.tool(
    "query_openstreetmap", // Tool name as string
    { 
      // Parameters defined with Zod schema
      query: z.string().describe("The place name, address, or landmark to search for.")
    },
    async (params) => { // Function with proper return format
      // Call our existing implementation
      const result = await queryOpenStreetMap(params);
      
      // Transform result into expected MCP response format
      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    }
  );
  
  // Add debug log for tools
  const toolNames = Object.keys(server).includes('tools') ? Object.keys((server as any).tools || {}) : [];
  console.log(`[SSE Connection] Server initialized with tools: ${JSON.stringify(toolNames)}`);
  console.log("[SSE Connection] MCP Server instance created with tools");

  // Create the SSE transport layer, linking it to the response object
  // Provide the required message posting URL as the first argument
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport; // Store the transport
  console.log(`[SSE Connection] SSE Transport created with sessionId: ${transport.sessionId}`);
  
  // Add detailed log before connect
  console.log(`[SSE Connection] Attempting server.connect for session ${transport.sessionId}...`); 

  try {
    // Establish the MCP connection between the server and the transport
    // This performs the handshake and prepares for message exchange
    await server.connect(transport);
    console.log(`[SSE Connection] MCP server connected successfully for session: ${transport.sessionId}`);

  } catch (error) {
    console.error(`[SSE Connection] Error during MCP server connect for session ${transport.sessionId}:`, error);
    // Ensure connection is closed if handshake fails
    if (!res.writableEnded) {
      res.end();
    }
    return; // Stop further processing for this request
  }

  // Handle client disconnection
  req.on('close', () => {
    console.log(`[SSE Connection] Client disconnected for session: ${transport.sessionId}`);
    // Clean up the transport when the client closes the connection
    delete transports[transport.sessionId];
    console.log(`[Session Management] Transport for session ${transport.sessionId} removed.`);
  });
});

// Add endpoint for clients to POST messages to
app.post("/messages", express.text({ type: '*/*' }), async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  console.log(`[Messages Endpoint] Received POST for session: ${sessionId}`);
  const transport = transports[sessionId];
  if (transport) {
    try {
      await transport.handleMessage(req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error(`[Messages Endpoint] Error handling message for session ${sessionId}:`, error);
      res.status(500).send('Error processing message');
    }
  } else {
    console.warn(`[Messages Endpoint] No active transport found for session: ${sessionId}`);
    res.status(404).send('Session not found or inactive');
  }
});

// --- Server Startup ---

app.listen(port, () => {
  console.log(`[Server Startup] OpenStreetMap MCP Server listening on http://localhost:${port}`);
  console.log(`[Server Startup] Health check available at http://localhost:${port}/health`);
  console.log(`[Server Startup] SSE endpoint available at http://localhost:${port}/sse`);
});

// Optional: Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server Shutdown] SIGTERM signal received. Closing active sessions and server.');
  // Closing the server might involve closing transports if they hold resources
  Object.values(transports).forEach(transport => {
    // transport.close(); // Assuming transport has a close method if needed
  });
  console.log('[Server Shutdown] Active transports notified/closed.');
  process.exit(0);
}); 