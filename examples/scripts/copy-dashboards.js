const fs = require('fs');
const path = require('path');

const dashboardsSourceDir = path.join(__dirname, '../dashboards');
const samplesFile = path.join(__dirname, '../samples.json');
const targetDir = path.join(__dirname, '../dist');
const dashboardsTargetDir = path.join(targetDir, 'dashboards');
const srcDir = path.join(__dirname, '../src');

// Helper function to recursively copy directory
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy dashboards directory
console.log('Copying dashboards...');
copyRecursive(dashboardsSourceDir, dashboardsTargetDir);

// Copy samples.json
console.log('Copying samples.json...');
fs.copyFileSync(samplesFile, path.join(targetDir, 'samples.json'));

// Copy HTML and JS files from src
console.log('Copying HTML and JS files...');
if (fs.existsSync(srcDir)) {
  const srcFiles = fs.readdirSync(srcDir);
  for (const file of srcFiles) {
    if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) {
      fs.copyFileSync(path.join(srcDir, file), path.join(targetDir, file));
    }
  }
}

// Copy mock data
const mockDataDir = path.join(__dirname, '../mock-data');
if (fs.existsSync(mockDataDir)) {
  console.log('Copying mock data...');
  copyRecursive(mockDataDir, path.join(targetDir, 'mock-data'));
}

// Copy mock data to expected endpoint paths for dashboards that reference local APIs
const mockEndpoints = {
  'mock-data/quarkus-metrics.txt': 'data/quarkus/metrics',
  'mock-data/jupyterhub-metrics.txt': 'dashboards/jupyterhub/metrics/metrics',
  'mock-data/ansible-metrics.txt': 'data/metrics',
  'mock-data/triton-metrics.txt': 'data/triton/metrics',
};

for (const [src, dest] of Object.entries(mockEndpoints)) {
  const srcPath = path.join(__dirname, '..', src);
  const destPath = path.join(targetDir, dest);
  if (fs.existsSync(srcPath)) {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
    console.log(`Mock endpoint: ${dest}`);
  }
}

console.log('All files copied successfully');
