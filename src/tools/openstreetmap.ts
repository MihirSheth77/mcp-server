import fetch from 'node-fetch';

// Define the interface for the tool's input parameters
interface QueryOpenStreetMapParams {
  query: string;
}

// Define the structure of the expected response from Nominatim API
interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: { [key: string]: string };
  boundingbox: string[];
  importance?: number;
  class?: string;
  type?: string;
}

/**
 * Queries the OpenStreetMap Nominatim API to find information about a location.
 * @param params - An object containing the search query string.
 * @returns A promise that resolves with the location information or an error message.
 */
export async function queryOpenStreetMap({ query }: QueryOpenStreetMapParams) {
  console.log(`[Tool Execution] queryOpenStreetMap called with query: "${query}"`);

  if (!query || query.trim().length === 0) {
    console.warn('[Tool Execution] Empty query received for OpenStreetMap');
    return { error: 'Query parameter cannot be empty.' };
  }

  const encodedQuery = encodeURIComponent(query);
  // Construct the Nominatim API URL
  // limit=1 restricts the result to the most relevant one
  const apiUrl = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1`;

  console.log(`[Tool Execution] Contacting Nominatim API: ${apiUrl}`);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        // IMPORTANT: Provide a descriptive User-Agent as required by OSM's usage policy
        // Replace 'YourAppName/1.0 (your-contact-email@example.com)' with your actual app info
        'User-Agent': 'MCP-Server-OSM-Tool/1.0 (contact@example.com)'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Tool Execution] Nominatim API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Nominatim API request failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as NominatimResult[];

    if (!data || data.length === 0) {
      console.log(`[Tool Execution] No results found for query: "${query}"`);
      return {
        query,
        found: false,
        message: `Could not find location information for "${query}".`
      };
    }

    // Process the first result
    const result = data[0];
    console.log(`[Tool Execution] Found result for "${query}": ${result.display_name}`);

    // Return a structured response
    return {
      query,
      found: true,
      display_name: result.display_name,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      address_details: result.address, // Provides structured address components
      osm_type: result.osm_type,
      osm_id: result.osm_id,
      class: result.class, // Broad category (e.g., place, highway)
      type: result.type,   // Specific type (e.g., city, restaurant)
    };

  } catch (error) {
    console.error(`[Tool Execution] Error querying OpenStreetMap:`, error);
    
    // Safely handle the 'unknown' error type
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Return a structured error for the AI assistant
    return {
      query,
      found: false,
      error: `Failed to query OpenStreetMap: ${errorMessage}`
    };
  }
} 