import { NextRequest, NextResponse } from 'next/server';

// Use nodejs runtime for Buffer support (needed for base64 image uploads)
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow longer timeouts for video generation

/**
 * Proxy requests to ComfyUI server to avoid CORS issues
 * Supports GET (system_stats, view) and POST (prompt, upload)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const endpoint = searchParams.get('endpoint');

  if (!address || !endpoint) {
    return NextResponse.json(
      { error: 'Missing address or endpoint parameter' },
      { status: 400 }
    );
  }

  try {
    // Decode the address and endpoint in case they're URL-encoded
    const decodedAddress = decodeURIComponent(address);
    const decodedEndpoint = decodeURIComponent(endpoint);

    // Build the target URL
    const baseUrl = `http://${decodedAddress}`;
    const targetUrl = new URL(decodedEndpoint, baseUrl);
    console.log(`[ComfyUI Proxy] GET ${decodedEndpoint} -> ${targetUrl.toString()}`);

    // Forward any additional query params (except address and endpoint)
    searchParams.forEach((value, key) => {
      if (key !== 'address' && key !== 'endpoint' && value) {
        // Only add non-empty values - decode first
        targetUrl.searchParams.set(key, decodeURIComponent(value));
      }
    });

    console.log(`[ComfyUI Proxy] Full URL: ${targetUrl.toString()}`);

    // Use appropriate Accept header based on endpoint
    const isViewEndpoint = endpoint === '/view';
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': isViewEndpoint ? '*/*' : 'application/json',
      },
      signal: AbortSignal.timeout(isViewEndpoint ? 30000 : 10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[ComfyUI Proxy] Error from ComfyUI: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `ComfyUI returned ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    // Check content type to determine response handling
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data);
    } else if (contentType.includes('image/') || contentType.includes('video/') || contentType.includes('application/octet-stream')) {
      // Return binary data for images/videos
      const data = await response.arrayBuffer();
      console.log(`[ComfyUI Proxy] Returning binary data: ${contentType}, ${data.byteLength} bytes`);
      return new NextResponse(data, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=300',
        },
      });
    } else {
      // Return as text for other types
      const text = await response.text();
      return new NextResponse(text, {
        headers: { 'Content-Type': contentType },
      });
    }
  } catch (error) {
    console.error('[ComfyUI Proxy] GET error:', error);
    console.error('[ComfyUI Proxy] Params - address:', address, 'endpoint:', endpoint);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');
  const endpoint = searchParams.get('endpoint');

  if (!address || !endpoint) {
    return NextResponse.json(
      { error: 'Missing address or endpoint parameter' },
      { status: 400 }
    );
  }

  try {
    const targetUrl = new URL(endpoint, `http://${address}`);

    const contentType = request.headers.get('content-type') || '';

    let body: BodyInit;
    let headers: HeadersInit = {};

    // Check if this is a base64 image upload (our custom format)
    if (endpoint === '/upload/image' && contentType.includes('application/json')) {
      const json = await request.json();

      if (json.image_base64) {
        // Convert base64 to blob and create FormData
        const imageBuffer = Buffer.from(json.image_base64, 'base64');
        const formData = new FormData();
        formData.append('image', new Blob([imageBuffer]), json.filename || 'image.png');
        if (json.subfolder) {
          formData.append('subfolder', json.subfolder);
        }
        formData.append('overwrite', json.overwrite?.toString() || 'true');

        const response = await fetch(targetUrl.toString(), {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return NextResponse.json(
            { error: `ComfyUI returned ${response.status}: ${errorText}` },
            { status: response.status }
          );
        }

        const data = await response.json();
        return NextResponse.json(data);
      }

      // Regular JSON body
      body = JSON.stringify(json);
      headers['Content-Type'] = 'application/json';
    } else if (contentType.includes('multipart/form-data')) {
      // For file uploads, pass through the form data
      body = await request.arrayBuffer();
      headers['Content-Type'] = contentType;
    } else {
      // For JSON requests
      body = await request.text();
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ComfyUI Proxy] POST error from ComfyUI: ${response.status}`);
      console.error(`[ComfyUI Proxy] Error body:`, errorText);
      return NextResponse.json(
        { error: `ComfyUI returned ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[ComfyUI Proxy] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: 500 }
    );
  }
}
