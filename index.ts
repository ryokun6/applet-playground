import { watch } from 'fs';

// Store connected SSE clients
const clients = new Set<ReadableStreamDefaultController>();

const server = Bun.serve({
  port: 4002,
  development: true,
  async fetch(req) {
    const url = new URL(req.url);
    
    // SSE endpoint for reload notifications
    if (url.pathname === '/reload') {
      const stream = new ReadableStream({
        start(controller) {
          clients.add(controller);
          // Send initial connection message
          controller.enqueue(new TextEncoder().encode('data: connected\n\n'));
          
          // Clean up on disconnect
          req.signal.addEventListener('abort', () => {
            clients.delete(controller);
            controller.close();
          });
        },
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Serve the HTML file as index
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/AI SimCity.html') {
      const file = await Bun.file('./AI SimCity.html').text();
      
      // Inject reload script before closing body tag
      const reloadScript = `
<script>
  (function() {
    const eventSource = new EventSource('/reload');
    eventSource.onmessage = function(event) {
      if (event.data === 'reload') {
        console.log('🔄 Reloading page...');
        window.location.reload();
      }
    };
    eventSource.onerror = function() {
      console.log('Reload connection closed');
      eventSource.close();
    };
  })();
</script>`;
      
      // Inject before </body> or at the end if no body tag
      const modifiedHtml = file.includes('</body>') 
        ? file.replace('</body>', reloadScript + '</body>')
        : file + reloadScript;
      
      return new Response(modifiedHtml, {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
    
    // Serve other static files
    const file = Bun.file('.' + url.pathname);
    if (await file.exists()) {
      return new Response(file);
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`🚀 Server running on http://localhost:${server.port}`);

// Watch for HTML file changes and notify clients
let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
const debounceDelay = 300;

const watcher = watch('.', { recursive: false }, (eventType, filename) => {
  // Only watch HTML files
  if (filename && filename.endsWith('.html')) {
    // Debounce reload notifications
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }
    
    reloadTimeout = setTimeout(() => {
      console.log(`\n📝 File changed: ${filename}`);
      console.log('🔄 Notifying clients to reload...');
      
      // Notify all connected clients
      const message = 'data: reload\n\n';
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      
      for (const client of clients) {
        try {
          client.enqueue(data);
        } catch (err) {
          // Client disconnected, remove it
          clients.delete(client);
        }
      }
      
      console.log(`✅ Notified ${clients.size} client(s)\n`);
      reloadTimeout = null;
    }, debounceDelay);
  }
});

console.log('👀 Watching for HTML file changes (auto-reload enabled)...');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  watcher.close();
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  watcher.close();
  await server.stop();
  process.exit(0);
});
