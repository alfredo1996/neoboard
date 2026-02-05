import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export default async () => {
  const configPath = path.join(__dirname, 'neo4j-runtime.json');

  if (fs.existsSync(configPath)) {
    const { containerId } = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    try {
      // 🔥 Stop the container by ID
      execSync(`docker rm -fv ${containerId}`, { stdio: 'inherit' });
    } catch (err) {
      console.warn(`Failed to stop container ${containerId}:`, err);
    }

    try {
      fs.unlinkSync(configPath);
    } catch (err) {
      console.warn(`Could not delete ${configPath}:`, err);
    }
  }
};
