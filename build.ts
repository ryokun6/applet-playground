import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';

interface AppletManifest {
  content: string;
  title: string;
  icon: string;
  name: string;
  windowWidth: number;
  windowHeight: number;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  featured: boolean;
}

async function extractTitle(html: string): Promise<string> {
  // Try to extract title from HTML
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) return titleMatch[1];
  
  // Try to extract from h1
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) return h1Match[1].replace(/<[^>]*>/g, '');
  
  // Default to filename without extension
  return 'Untitled';
}

function getIconForFile(filename: string): string {
  // Map common app types to emojis
  const iconMap: Record<string, string> = {
    'simcity': '🏙️',
    'city': '🏙️',
    'game': '🎮',
    'calculator': '🔢',
    'clock': '⏰',
    'calendar': '📅',
    'todo': '✅',
    'notes': '📝',
    'chat': '💬',
    'weather': '🌤️',
  };
  
  const lowerName = filename.toLowerCase();
  for (const [key, icon] of Object.entries(iconMap)) {
    if (lowerName.includes(key)) return icon;
  }
  
  return '📄'; // Default icon
}

export async function buildApplets() {
  const distDir = join(process.cwd(), 'dist');
  
  // Create dist directory if it doesn't exist
  try {
    await mkdir(distDir, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }
  
  // Read all HTML files from the current directory
  const files = await readdir(process.cwd());
  const htmlFiles = files.filter(f => f.endsWith('.html'));
  
  console.log(`Found ${htmlFiles.length} HTML file(s) to process`);
  
  for (const file of htmlFiles) {
    console.log(`Processing: ${file}`);
    
    const htmlContent = await readFile(join(process.cwd(), file), 'utf-8');
    const timestamp = Date.now();
    
    let manifest: AppletManifest;
    
    // Special handling for AI SimCity
    if (file === 'AI SimCity.html') {
      manifest = {
        content: htmlContent,
        title: "AI SimCity",
        icon: "🏙️",
        name: "AI SimCity.app",
        windowWidth: 420,
        windowHeight: 625,
        createdAt: timestamp, // Use current timestamp
        createdBy: "ryo",
        updatedAt: timestamp,
        featured: true
      };
    } else {
      // Default behavior for other files
      const title = await extractTitle(htmlContent) || basename(file, '.html');
      const icon = getIconForFile(file);
      
      manifest = {
        content: htmlContent,
        title: title,
        icon: icon,
        name: `${basename(file, '.html')}.app`,
        windowWidth: 420,
        windowHeight: 625,
        createdAt: timestamp,
        createdBy: "ryo",
        updatedAt: timestamp,
        featured: true
      };
    }
    
    const outputFile = join(distDir, `${basename(file, '.html')}.json`);
    await writeFile(outputFile, JSON.stringify(manifest, null, 2), 'utf-8');
    
    console.log(`✓ Generated: ${outputFile}`);
  }
  
  console.log(`\n✨ Build complete! Generated ${htmlFiles.length} applet(s) in /dist`);
}

// Run the build only when executed directly (not when imported)
if (import.meta.main) {
  buildApplets().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}

