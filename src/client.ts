import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const serverBaseUrl = process.env.SERVER_URL || 'http://localhost:3000';
// Explicitly add the /sse endpoint to the URL
const sseUrl = `${serverBaseUrl}/sse`;

async function runMinimalClient() {
  console.log(`[Client] Connecting to MCP server at ${serverBaseUrl}...`);
  console.log(`[Client] Using SSE endpoint: ${sseUrl}`);

  const transport = new SSEClientTransport(new URL(sseUrl));
  console.log('[Client] SSE Transport created.');

  const client = new Client(
    { name: "minimal-test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  console.log('[Client] MCP Client created.');

  try {
    await client.connect(transport);
    console.log(`[Client] Successfully connected.`);

    // First list available tools to check what's available
    console.log("\n[Client] Listing available tools...");
    const toolsList = await client.listTools();
    console.log("[Client] Tools available:", JSON.stringify(toolsList.tools, null, 2));
    
    // Now attempt to call the tool like the working example
    const toolName = 'query_openstreetmap';
    const parameters = { query: "Eiffel Tower, Paris" };
    console.log(`\n[Client] Calling ${toolName} with parameters:`, parameters);
    
    // Use the format from the working example
    const result = await client.callTool({ name: toolName, arguments: parameters });
    
    console.log('[Client] Raw tool call result received:');
    console.log(JSON.stringify(result, null, 2));
    
    // Try to parse the content property if it exists - add type assertions for TypeScript
    if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const firstItem = result.content[0] as any; // Type assertion to help TypeScript
        if (firstItem?.type === 'text') {
            try {
                console.log("[Client] Parsed content:", JSON.parse(firstItem.text));
            } catch (e) {
                console.log("[Client] Content (not JSON):", firstItem.text);
            }
        }
    }

  } catch (error) {
    console.error('[Client] An error occurred:', error);
  } finally {
    // Basic close attempt - ignoring isConnected for now
    try {
        console.log('\n[Client] Closing connection...');
        await client.close();
        console.log('[Client] Connection closed.');
    } catch (closeError) {
        console.error('[Client] Error closing client:', closeError);
    }
  }
}

runMinimalClient(); 