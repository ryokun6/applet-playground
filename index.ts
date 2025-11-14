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
          console.log(`✅ Client connected (${clients.size} total client(s))`);
          const encoder = new TextEncoder();
          
          // Send initial connection message
          try {
            controller.enqueue(encoder.encode('data: connected\n\n'));
          } catch (err) {
            console.error('Error sending initial SSE message:', err);
            clients.delete(controller);
            return;
          }
          
          // Send periodic keepalive ping (every 30 seconds)
          const keepAliveInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': ping\n\n'));
            } catch (err) {
              clearInterval(keepAliveInterval);
              clients.delete(controller);
            }
          }, 30000);
          
          // Clean up on disconnect
          req.signal.addEventListener('abort', () => {
            clearInterval(keepAliveInterval);
            clients.delete(controller);
            console.log(`❌ Client disconnected (${clients.size} remaining client(s))`);
            try {
              controller.close();
            } catch (err) {
              // Ignore errors on close
            }
          });
        },
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
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
    let eventSource = null;
    let reconnectTimeout = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    
    function connect() {
      try {
        if (eventSource) {
          eventSource.close();
        }
        eventSource = new EventSource('/reload');
        
        eventSource.onopen = function() {
          console.log('✅ Auto-reload connected');
          reconnectAttempts = 0;
        };
        
        eventSource.onmessage = function(event) {
          if (event.data === 'reload' || event.data === 'connected') {
            if (event.data === 'reload') {
              console.log('🔄 Reloading page...');
              window.location.reload();
            }
          }
        };
        
        eventSource.onerror = function(err) {
          console.log('⚠️ Auto-reload connection error, reconnecting...');
          eventSource.close();
          eventSource = null;
          
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            reconnectTimeout = setTimeout(connect, 1000 * reconnectAttempts);
          } else {
            console.log('❌ Auto-reload: Max reconnection attempts reached');
          }
        };
      } catch (err) {
        console.error('Auto-reload connection error:', err);
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connect, 1000 * reconnectAttempts);
        }
      }
    }
    
    connect();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    });
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
      const encoder = new TextEncoder();
      const message = encoder.encode('data: reload\n\n');
      
      const clientsToRemove: ReadableStreamDefaultController[] = [];
      
      for (const client of clients) {
        try {
          client.enqueue(message);
        } catch (err) {
          // Client disconnected, mark for removal
          clientsToRemove.push(client);
        }
      }
      
      // Remove disconnected clients
      for (const client of clientsToRemove) {
        clients.delete(client);
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
