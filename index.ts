const server = Bun.serve({
  port: 4002,
  development: true, // Enables HMR automatically
  async fetch(req) {
    const url = new URL(req.url);
    
    // Serve the HTML file as index
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/AI SimCity.html') {
      const file = Bun.file('./AI SimCity.html');
      return new Response(file, {
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

console.log(`Server running on http://localhost:${server.port}`);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});
