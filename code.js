/**
 * YouTube Video Interaction Bot with Proxy Support
 * 
 * Features:
 * - Puppeteer-based browser automation
 * - Realistic video viewing simulation
 * - Multiple proxy modes: none, direct, or Proxifly API
 * - Automatic proxy rotation with no repetition
 * - Smart proxy refetching when pool is exhausted
 * - Modern Chrome user agents and viewport randomization
 * 
 * Proxy Modes:
 * 1. 'none' - No proxy, direct connection
 * 2. 'direct' - Use your own proxy server (SOCKS5/SOCKS4/HTTP)
 * 3. 'proxifly' - Use Proxifly API for automatic proxy management
 * 
 * Proxifly Integration:
 * - Automatically fetches proxies from Proxifly API
 * - Tracks all used proxies to ensure no repetition
 * - Auto-refetches new proxies when current pool is exhausted
 * - Filters out previously used proxies
 * - Get your API key from: https://proxifly.dev/
 */

// Load environment variables from .env file
require('dotenv').config();

const puppeteer = require('puppeteer');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const randomUseragent = require('random-useragent');
const Proxifly = require('proxifly');
const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
    maxRetries: 5,
    backoffDelays: [1000, 3000, 5000, 9000, 15000], // Exponential backoff
    maxConcurrent: 5, // Reduced for browser instances
    totalRequests: 250, // Reduced for resource management
    timeout: 160000, // 60 second timeout for page load (YouTube needs time)
    viewport: { width: 1920, height: 1080 },
    
    // Proxy Mode: Choose between 'direct', 'proxifly', 'free-proxy-list', or 'none'
    // - 'none': No proxy used
    // - 'direct': Use direct proxy configuration below
    // - 'proxifly': Use Proxifly API to fetch proxies
    // - 'free-proxy-list': Use free proxy lists from CDN (no API key needed)
    proxyMode: 'free-proxy-list', // Options: 'none', 'direct', 'proxifly', 'free-proxy-list'
    
    // Direct Proxy Configuration
    // Used when proxyMode = 'direct'
    // Example usage:
    //   - SOCKS5: protocol: 'socks5', host: 'proxy.example.com', port: 1080
    //   - HTTP:   protocol: 'http', host: 'proxy.example.com', port: 8080
    //   - With auth: set username and password
    proxy: {
        protocol: 'socks5', // 'socks5', 'socks4', or 'http'
        host: '127.0.0.1',
        port: 9150,
        username: '', // Leave empty if no authentication required
        password: ''
    },
    
    // Proxifly Configuration
    // Used when proxyMode = 'proxifly'
    // Get your API key from: https://proxifly.dev/
    // API key is loaded from .env file (PROXIFLY_API_KEY)
    proxifly: {
        apiKey: process.env.PROXIFLY_API_KEY || '', // Load from .env file
        protocol: 'https', // 'http' | 'socks4' | 'socks5'
        anonymity: 'transparent', // 'transparent' | 'anonymous' | 'elite'
        country: 'GB', // Single country code (ISO 3166-1 alpha-2)
        https: true, // true | false - Require HTTPS support
        speed: 100000, // 0 - 60000 (milliseconds)
        format: 'json', // 'json' | 'text'
        quantity: 50, // 1 - 20 (number of proxies to fetch per request)
        rotateProxies: true // Rotate through fetched proxies for each request
    },
    
    // Free Proxy List Configuration
    // Used when proxyMode = 'free-proxy-list'
    // Fetches proxies from free CDN sources (no API key needed)
    freeProxyList: {
        sources: [
            {
                url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt',
                protocol: 'socks5',
                priority: 1 // Try this first
            },
            {
                url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt',
                protocol: 'http', // Default protocol for 'all' list
                priority: 2 // Fallback
            }
        ],
        rotateProxies: true, // Rotate through fetched proxies
        fetchOnStart: true // Fetch all sources on startup
    }
};

// Global proxy pool
let proxiflyProxies = [];
let proxiflyCurrentIndex = 0;
let freeProxyList = []; // Store proxies from free proxy list
let freeProxyIndex = 0;
let usedProxies = new Set(); // Track all used proxies to avoid repetition
let proxyFetchAttempts = 0;
let currentSourceIndex = 0; // Track which source we're using from free proxy list
const MAX_FETCH_ATTEMPTS = 5; // Maximum number of times to try fetching new proxies

// Create unique identifier for a proxy
function getProxyId(proxy) {
    // Handle both ipPort format and separate ip:port format
    if (proxy.ipPort) {
        return `${proxy.ipPort}`;
    } else if (proxy.ip && proxy.port) {
        return `${proxy.ip}:${proxy.port}`;
    }
    return JSON.stringify(proxy); // Fallback
}

// Fetch data from URL using http/https
function fetchFromUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (res) => {
            let data = '';
            
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                return resolve(fetchFromUrl(res.headers.location));
            }
            
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            
            res.on('data', chunk => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', reject);
    });
}

// Fetch proxies from free proxy list CDN
async function fetchFreeProxyList(sourceIndex = 0) {
    const sources = CONFIG.freeProxyList.sources;
    
    if (sourceIndex >= sources.length) {
        throw new Error('All free proxy list sources exhausted');
    }
    
    const source = sources[sourceIndex];
    console.log(`🔄 Fetching free proxies from source ${sourceIndex + 1}/${sources.length}...`);
    console.log(`   URL: ${source.url}`);
    console.log(`   Protocol: ${source.protocol}`);
    
    try {
        const data = await fetchFromUrl(source.url);
        
        // Parse proxy list (one proxy per line in format: ip:port)
        const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        console.log(`📥 Received ${lines.length} proxies from source`);
        
        // Convert to proxy objects
        const proxies = lines.map(ipPort => {
            return {
                ipPort: ipPort,
                protocol: source.protocol,
                source: source.url
            };
        });
        
        // Filter out already used proxies
        const beforeFilter = proxies.length;
        const newProxies = proxies.filter(proxy => {
            const proxyId = getProxyId(proxy);
            return !usedProxies.has(proxyId);
        });
        
        console.log(`🔄 Filtered: ${beforeFilter} -> ${newProxies.length} proxies (${beforeFilter - newProxies.length} already used)`);
        
        if (newProxies.length === 0) {
            console.log(`⚠️  All proxies from this source have been used. Trying next source...`);
            // Try next source
            return await fetchFreeProxyList(sourceIndex + 1);
        }
        
        freeProxyList = newProxies;
        freeProxyIndex = 0;
        currentSourceIndex = sourceIndex;
        proxyFetchAttempts = 0;
        
        console.log(`✅ Loaded ${freeProxyList.length} unique proxies from free proxy list (${usedProxies.size} total used so far)`);
        
        return freeProxyList;
        
    } catch (error) {
        console.error(`❌ Failed to fetch from source ${sourceIndex + 1}:`, error.message);
        
        // Try next source
        if (sourceIndex + 1 < sources.length) {
            console.log(`⚠️  Trying next proxy source...`);
            return await fetchFreeProxyList(sourceIndex + 1);
        } else {
            throw new Error(`Failed to fetch proxies from all sources: ${error.message}`);
        }
    }
}

// Get next proxy from free proxy list (with rotation and auto-refetch)
async function getNextFreeProxy() {
    // Check if we need to fetch more proxies
    if (freeProxyList.length === 0 || freeProxyIndex >= freeProxyList.length) {
        console.log('🔄 All proxies in current pool have been used. Fetching new proxies...');
        
        proxyFetchAttempts++;
        if (proxyFetchAttempts >= MAX_FETCH_ATTEMPTS) {
            throw new Error(`Unable to fetch new unique proxies after ${MAX_FETCH_ATTEMPTS} attempts`);
        }
        
        try {
            // Try to fetch from next source or start from beginning
            const nextSourceIndex = (currentSourceIndex + 1) % CONFIG.freeProxyList.sources.length;
            await fetchFreeProxyList(nextSourceIndex);
        } catch (error) {
            throw new Error(`Failed to fetch new proxies: ${error.message}`);
        }
    }

    // Get the next proxy
    let proxy;
    if (CONFIG.freeProxyList.rotateProxies) {
        proxy = freeProxyList[freeProxyIndex];
        freeProxyIndex++;
    } else {
        // Random selection from available unused proxies
        const randomIndex = Math.floor(Math.random() * freeProxyList.length);
        proxy = freeProxyList[randomIndex];
        // Remove the used proxy from the pool
        freeProxyList.splice(randomIndex, 1);
    }

    // Mark this proxy as used
    const proxyId = getProxyId(proxy);
    usedProxies.add(proxyId);
    
    return proxy;
}

// Fetch proxies from Proxifly API
async function fetchProxiflyProxies(filterUsed = true) {
    if (!CONFIG.proxifly.apiKey) {
        throw new Error('Proxifly API key is required when proxyMode is set to "proxifly"');
    }

    console.log('🔄 Fetching proxies from Proxifly...');
    
    try {
        const proxifly = new Proxifly({ apiKey: CONFIG.proxifly.apiKey });
        
        // Build options according to Proxifly API documentation
        const options = {
            protocol: CONFIG.proxifly.protocol,
            anonymity: CONFIG.proxifly.anonymity,
            country: CONFIG.proxifly.country,
            https: CONFIG.proxifly.https,
            speed: CONFIG.proxifly.speed,
            format: CONFIG.proxifly.format,
            quantity: CONFIG.proxifly.quantity
        };

        console.log('📦 Requesting proxies with options:', JSON.stringify(options, null, 2));
        
        const result = await proxifly.getProxy(options);
        
        console.log('📥 Received response from Proxifly:', typeof result, Array.isArray(result) ? `Array[${result.length}]` : 'Object');

        // Handle response - if quantity > 1, result is an array
        let newProxies = [];
        if (Array.isArray(result)) {
            newProxies = result;
        } else if (result && typeof result === 'object') {
            // Single proxy or wrapped response
            newProxies = [result];
        } else {
            throw new Error('Unexpected response format from Proxifly API');
        }

        if (newProxies.length === 0) {
            throw new Error('No proxies returned from Proxifly API');
        }

        console.log(`📋 Raw proxies received: ${newProxies.length}`);
        console.log('🔍 Sample proxy:', JSON.stringify(newProxies[0], null, 2));
        
        // Filter out already used proxies
        if (filterUsed) {
            const beforeFilter = newProxies.length;
            newProxies = newProxies.filter(proxy => {
                const proxyId = getProxyId(proxy);
                return !usedProxies.has(proxyId);
            });
            console.log(`🔄 Filtered: ${beforeFilter} -> ${newProxies.length} proxies (${beforeFilter - newProxies.length} already used)`);
        }
        
        if (newProxies.length === 0) {
            console.log(`⚠️  All fetched proxies have been used before. Attempting to fetch more...`);
            proxyFetchAttempts++;
            
            if (proxyFetchAttempts >= MAX_FETCH_ATTEMPTS) {
                throw new Error(`Unable to fetch new unique proxies after ${MAX_FETCH_ATTEMPTS} attempts. All available proxies may have been used.`);
            }
            
            // Try fetching again with potentially different proxies
            return await fetchProxiflyProxies(filterUsed);
        }
        
        proxiflyProxies = newProxies;
        proxiflyCurrentIndex = 0; // Reset index for new proxy pool
        proxyFetchAttempts = 0; // Reset attempts counter on success
        
        console.log(`✅ Fetched ${proxiflyProxies.length} new unique proxies from Proxifly (${usedProxies.size} proxies used so far)`);
        return proxiflyProxies;
        
    } catch (error) {
        console.error('❌ Failed to fetch proxies from Proxifly:', error.message);
        console.error('Error details:', error);
        throw error;
    }
}

// Get next proxy from Proxifly pool (with rotation and auto-refetch)
async function getNextProxiflyProxy() {
    // Check if we need to fetch more proxies (all current ones have been used)
    if (proxiflyProxies.length === 0 || proxiflyCurrentIndex >= proxiflyProxies.length) {
        console.log('🔄 All proxies in current pool have been used. Fetching new proxies...');
        try {
            await fetchProxiflyProxies(true);
        } catch (error) {
            throw new Error(`Failed to fetch new proxies: ${error.message}`);
        }
    }

    // Get the next proxy
    let proxy;
    if (CONFIG.proxifly.rotateProxies) {
        proxy = proxiflyProxies[proxiflyCurrentIndex];
        proxiflyCurrentIndex++;
    } else {
        // Random selection from available unused proxies
        const randomIndex = Math.floor(Math.random() * proxiflyProxies.length);
        proxy = proxiflyProxies[randomIndex];
        // Remove the used proxy from the pool
        proxiflyProxies.splice(randomIndex, 1);
    }

    // Mark this proxy as used
    const proxyId = getProxyId(proxy);
    usedProxies.add(proxyId);
    
    return proxy;
}

// Get proxy usage statistics
function getProxyStats() {
    if (CONFIG.proxyMode === 'proxifly') {
        return {
            totalUsed: usedProxies.size,
            remainingInPool: proxiflyProxies.length - proxiflyCurrentIndex,
            currentPoolSize: proxiflyProxies.length,
            mode: 'proxifly'
        };
    } else if (CONFIG.proxyMode === 'free-proxy-list') {
        return {
            totalUsed: usedProxies.size,
            remainingInPool: freeProxyList.length - freeProxyIndex,
            currentPoolSize: freeProxyList.length,
            mode: 'free-proxy-list'
        };
    }
    return {
        totalUsed: 0,
        remainingInPool: 0,
        currentPoolSize: 0,
        mode: CONFIG.proxyMode
    };
}

// Browser configuration
function getBrowserOptions(proxyConfig = null) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled', // Hide automation
    ];

    // Add proxy configuration based on mode
    if (CONFIG.proxyMode === 'direct') {
        // Direct proxy configuration
        const proxyUrl = `${CONFIG.proxy.protocol}://${CONFIG.proxy.host}:${CONFIG.proxy.port}`;
        args.push(`--proxy-server=${proxyUrl}`);
        console.log(`🔐 Using direct proxy: ${proxyUrl}`);
    } else if (CONFIG.proxyMode === 'proxifly' && proxyConfig) {
        // Proxifly proxy configuration
        // Handle both ipPort format and separate ip:port format
        let ipPort;
        if (proxyConfig.ipPort) {
            ipPort = proxyConfig.ipPort;
        } else if (proxyConfig.ip && proxyConfig.port) {
            ipPort = `${proxyConfig.ip}:${proxyConfig.port}`;
        } else {
            console.error('⚠️  Invalid proxy format:', proxyConfig);
            throw new Error('Invalid proxy format from Proxifly');
        }
        
        const protocol = proxyConfig.protocol || CONFIG.proxifly.protocol || 'http';
        const proxyUrl = `${protocol}://${ipPort}`;
        args.push(`--proxy-server=${proxyUrl}`);
        console.log(`🔐 Using Proxifly proxy: ${proxyUrl} (${proxyConfig.country || 'Unknown'})`);
    }

    return {
        headless: true, // Disable headless to see what's happening
        args: args,
        defaultViewport: CONFIG.viewport,
        ignoreHTTPSErrors: true,
    };
}

// Get random user agent - use modern Chrome versions
function getRandomUserAgent() {
    // Comprehensive list of modern Chrome user agents across different platforms and versions
    const modernUserAgents = [
        // Windows 10/11 - Chrome 120-123
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        
        // Windows 11 specifically
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        
        // macOS - Different versions
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        
        // macOS with Apple Silicon (M1/M2)
        'Mozilla/5.0 (Macintosh; ARM Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; ARM Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; ARM Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        
        // Linux - Various distributions
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        
        // Chrome with different build numbers for more variety
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.94 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.111 Safari/537.36',
    ];
    return modernUserAgents[Math.floor(Math.random() * modernUserAgents.length)];
}

// Get random viewport to simulate different devices
function getRandomViewport() {
    const viewports = [
        // Common Desktop Resolutions
        { width: 1920, height: 1080 }, // Full HD (most common)
        { width: 1920, height: 1200 }, // 16:10 Desktop
        { width: 2560, height: 1440 }, // 2K/QHD
        { width: 3840, height: 2160 }, // 4K UHD
        { width: 2560, height: 1600 }, // 16:10 High-res
        { width: 3440, height: 1440 }, // Ultrawide 21:9
        { width: 2560, height: 1080 }, // Ultrawide Full HD
        
        // Common Laptop Resolutions
        { width: 1366, height: 768 },  // Most common laptop
        { width: 1440, height: 900 },  // 16:10 Laptop
        { width: 1536, height: 864 },  // Laptop
        { width: 1600, height: 900 },  // Laptop
        { width: 1680, height: 1050 }, // 16:10 Laptop
        { width: 1280, height: 800 },  // Small laptop
        { width: 1280, height: 720 },  // HD Laptop
        
        // MacBook Resolutions (scaled)
        { width: 1440, height: 900 },  // MacBook Air 13" (scaled)
        { width: 1680, height: 1050 }, // MacBook Pro 13" (scaled)
        { width: 1920, height: 1200 }, // MacBook Pro 14" (scaled)
        { width: 2560, height: 1600 }, // MacBook Pro 16" (scaled)
        { width: 1728, height: 1117 }, // MacBook Pro 14" retina scaled
        
        // Other Common Resolutions
        { width: 1600, height: 1200 }, // 4:3 Desktop
        { width: 1280, height: 1024 }, // 5:4 Desktop
        { width: 1024, height: 768 },  // Older 4:3
        { width: 1280, height: 960 },  // 4:3 Desktop
    ];
    return viewports[Math.floor(Math.random() * viewports.length)];
}

// Scrape with retry logic using Puppeteer
async function scrapeWithRetry(url, retryCount = 0) {
    let browser;
    let page;
    let userAgent = 'Unknown'; // Declare outside try block for error handling
    let currentProxy = null; // Store current proxy info
    
    try {
        // Launch browser with random user agent and viewport
        userAgent = getRandomUserAgent();
        const viewport = getRandomViewport();
        
        if (!userAgent) {
            throw new Error('No suitable user agent found');
        }

        // Get proxy configuration based on mode
        if (CONFIG.proxyMode === 'proxifly') {
            currentProxy = await getNextProxiflyProxy();
        } else if (CONFIG.proxyMode === 'free-proxy-list') {
            currentProxy = await getNextFreeProxy();
        }

        browser = await puppeteer.launch(getBrowserOptions(currentProxy));
        page = await browser.newPage();
        
        // Set proxy authentication based on proxy mode
        if (CONFIG.proxyMode === 'direct' && CONFIG.proxy.username && CONFIG.proxy.password) {
            // Direct proxy authentication
            await page.authenticate({
                username: CONFIG.proxy.username,
                password: CONFIG.proxy.password
            });
            console.log(`🔑 [Worker ${workerData?.workerId || 'Main'}] Direct proxy authentication configured`);
        } else if (CONFIG.proxyMode === 'proxifly' && currentProxy && currentProxy.username && currentProxy.password) {
            // Proxifly proxy authentication (if proxy requires auth)
            await page.authenticate({
                username: currentProxy.username,
                password: currentProxy.password
            });
            console.log(`🔑 [Worker ${workerData?.workerId || 'Main'}] Proxifly proxy authentication configured`);
        }
        
        // Set random user agent and viewport
        await page.setUserAgent(userAgent);
        await page.setViewport(viewport);
        
        // Hide webdriver property to avoid detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        // Set extra headers for realism
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/avif,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Referer': 'https://www.alethia.ai',
        });

        // Set cookies to bypass consent screen
        await page.setCookie({
            name: 'CONSENT',
            value: 'YES+cb',
            domain: '.youtube.com'
        });

        // Block unnecessary resources to improve performance
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // Block only images and fonts, but allow media for video player
            if (['image', 'font'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`🌐 [Worker ${workerData?.workerId || 'Main'}] Visiting: ${url}`);
        console.log(`   User Agent: ${userAgent.substring(0, 80)}...`);
        console.log(`   Viewport: ${viewport.width}x${viewport.height}`);
        
        // Log proxy information
        if (CONFIG.proxyMode === 'direct') {
            console.log(`   Proxy: ${CONFIG.proxy.protocol}://${CONFIG.proxy.host}:${CONFIG.proxy.port}`);
        } else if (CONFIG.proxyMode === 'proxifly' && currentProxy) {
            // Handle both ipPort format and separate ip:port format
            const ipPort = currentProxy.ipPort || (currentProxy.ip && currentProxy.port ? `${currentProxy.ip}:${currentProxy.port}` : 'Unknown');
            const protocol = currentProxy.protocol || CONFIG.proxifly.protocol || 'http';
            console.log(`   Proxy: ${protocol}://${ipPort} (${currentProxy.country || 'Unknown'})`);
        } else if (CONFIG.proxyMode === 'none') {
            console.log(`   Proxy: None (Direct connection)`);
        }

        // Navigate to page with timeout
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded', // Wait for DOM to load, YouTube player loads via JS
            timeout: CONFIG.timeout
        });

        if (!response) {
            throw new Error('No response received');
        }

        const status = response.status();
        
        // Handle different status codes
        if (status >= 400) {
            if ((status === 429 || status >= 500) && retryCount < CONFIG.maxRetries) {
                throw new Error(`HTTP ${status} - Retry available`);
            }
            throw new Error(`HTTP ${status}`);
        }

        // Wait for video player to load
        console.log(`⏳ [Worker ${workerData?.workerId || 'Main'}] Waiting for video player...`);
        
        // Handle cookie consent if present
        try {
            const acceptButton = await page.$('button[aria-label*="Accept all"], button[aria-label*="Accept"]');
            const rejectButton = await page.$('button[aria-label*="Reject all"], button[aria-label*="Reject"]');
            
            if (acceptButton || rejectButton) {
                console.log(`🍪 [Worker ${workerData?.workerId || 'Main'}] Handling cookie consent...`);
                // Click reject to avoid extra tracking cookies and potential page reload
                const buttonToClick = rejectButton || acceptButton;
                
                await Promise.race([
                    buttonToClick.click(),
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {})
                ]);
                
                // Wait for page to stabilize
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (e) {
            // No consent dialog or already handled, continue
            console.log(`ℹ️  [Worker ${workerData?.workerId || 'Main'}] No consent dialog or already handled`);
        }
        
        // Wait for YouTube player container - try multiple selectors
        try {
            await page.waitForSelector('#movie_player, .html5-video-player', { timeout: 20000 });
        } catch (e) {
            console.log(`⚠️  [Worker ${workerData?.workerId || 'Main'}] Player container not found, checking for video element...`);
            await page.waitForSelector('video', { timeout: 10000 });
        }
        
        // Additional wait for player to fully initialize
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Extract view count from the page
        const viewCount = await page.evaluate(() => {
            // Try multiple selectors for view count (YouTube structure can vary)
            const selectors = [
                'ytd-video-view-count-renderer .view-count',
                '.view-count',
                'span.short-view-count',
                '#info span.view-count',
                'ytd-video-view-count-renderer span',
                '#count > ytd-video-view-count-renderer > span'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    return element.textContent.trim();
                }
            }
            
            // Try alternative method - look for text containing "views"
            const infoElements = document.querySelectorAll('#info span, ytd-video-primary-info-renderer span');
            for (const el of infoElements) {
                const text = el.textContent.trim();
                if (text.toLowerCase().includes('view')) {
                    return text;
                }
            }
            
            return 'View count not found';
        });

        console.log(`📊 [Worker ${workerData?.workerId || 'Main'}] View Count: ${viewCount}`);
        
        // Get video element and interact with it
        const videoInteraction = await page.evaluate(async () => {
            const video = document.querySelector('video');
            if (!video) {
                return { error: 'Video element not found' };
            }

            const results = {};
            
            // Wait for video to be ready and have metadata - increased timeout
            let attempts = 0;
            while ((video.readyState < 2 || isNaN(video.duration) || video.duration === 0) && attempts < 40) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            
            if (isNaN(video.duration) || video.duration === 0) {
                return { error: 'Video not ready - duration unavailable after waiting' };
            }

            results.duration = video.duration;
            
            // Generate random timestamps and delays to simulate real user behavior
            const randomPercent1 = 0.1 + Math.random() * 0.3; // 10-40% of video
            const randomPercent2 = 0.5 + Math.random() * 0.3; // 50-80% of video
            const randomSeek1 = Math.floor(video.duration * randomPercent1);
            const randomSeek2 = Math.floor(video.duration * randomPercent2);
            const watchTime1 = 2000 + Math.random() * 4000; // 2-6 seconds
            const watchTime2 = 2000 + Math.random() * 5000; // 2-7 seconds
            const watchTime3 = 1500 + Math.random() * 3500; // 1.5-5 seconds
            const pauseTime = 1000 + Math.random() * 2000; // 1-3 seconds
            
            // Step 1: Start the video and watch from beginning
            video.play();
            results.step1 = 'Video started playing from beginning';
            await new Promise(resolve => setTimeout(resolve, watchTime1));
            
            // Step 2: Seek to random position (like a user scrubbing through)
            video.currentTime = randomSeek1;
            const minutes1 = Math.floor(randomSeek1 / 60);
            const seconds1 = Math.floor(randomSeek1 % 60);
            results.step2 = `Seeked to ${minutes1}m ${seconds1}s (${randomPercent1.toFixed(1)}% of video)`;
            await new Promise(resolve => setTimeout(resolve, watchTime2));
            
            // Step 3: Pause the video (like a user pausing to do something)
            video.pause();
            results.step3 = `Video paused at ${minutes1}m ${seconds1}s`;
            await new Promise(resolve => setTimeout(resolve, pauseTime));
            
            // Step 4: Resume and seek to another random position
            video.play();
            video.currentTime = randomSeek2;
            const minutes2 = Math.floor(randomSeek2 / 60);
            const seconds2 = Math.floor(randomSeek2 % 60);
            results.step4 = `Resumed and seeked to ${minutes2}m ${seconds2}s (${randomPercent2.toFixed(1)}% of video)`;
            await new Promise(resolve => setTimeout(resolve, watchTime3));
            
            // Step 5: Jump near the end (like checking the ending)
            const nearEnd = video.duration - (5 + Math.random() * 10); // 5-15 seconds before end
            video.currentTime = nearEnd;
            const minutesEnd = Math.floor(nearEnd / 60);
            const secondsEnd = Math.floor(nearEnd % 60);
            results.step5 = `Jumped near end to ${minutesEnd}m ${secondsEnd}s`;
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
            
            // Step 6: Stop (pause)
            video.pause();
            results.step6 = 'Video stopped';
            
            return results;
        });

        if (videoInteraction.error) {
            console.log(`❌ [Worker ${workerData?.workerId || 'Main'}] Video Interaction Failed: ${videoInteraction.error}`);
        } else {
            console.log(`🎬 [Worker ${workerData?.workerId || 'Main'}] Video Interaction Complete:`);
            console.log(`   Duration: ${Math.floor(videoInteraction.duration / 60)}m ${Math.floor(videoInteraction.duration % 60)}s`);
            console.log(`   ✓ ${videoInteraction.step1}`);
            console.log(`   ✓ ${videoInteraction.step2}`);
            console.log(`   ✓ ${videoInteraction.step3}`);
            console.log(`   ✓ ${videoInteraction.step4}`);
            console.log(`   ✓ ${videoInteraction.step5}`);
            console.log(`   ✓ ${videoInteraction.step6}`);
        }

        // Extract page information
        const pageTitle = await page.title();
        const pageUrl = await page.url();
        
        // Get some page metrics
        const contentLength = await page.evaluate(() => document.documentElement.outerHTML.length);

        console.log(`✅ [Worker ${workerData?.workerId || 'Main'}] Success: ${url}`);
        console.log(`   Title: "${pageTitle.substring(0, 60)}..."`);
        console.log(`   Status: ${status}, Content: ${contentLength} chars`);

        await browser.close();
        
        return {
            success: true,
            status: status,
            title: pageTitle,
            finalUrl: pageUrl,
            userAgent: userAgent,
            viewport: viewport,
            contentLength: contentLength,
            videoInteraction: videoInteraction,
            viewCount: viewCount
        };

    } catch (error) {
        // Close browser in case of error
        if (browser) {
            await browser.close().catch(() => {}); // Silent fail on cleanup
        }

        const isRateLimit = error.message.includes('429');
        const isServerError = error.message.includes('5');
        const isTimeout = error.name === 'TimeoutError';
        
        if ((isRateLimit || isServerError || isTimeout) && retryCount < CONFIG.maxRetries) {
            const delay = CONFIG.backoffDelays[retryCount];
            console.log(`⏳ [Worker ${workerData?.workerId || 'Main'}] ${error.message}. Retry ${retryCount + 1}/${CONFIG.maxRetries} in ${delay}ms`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return scrapeWithRetry(url, retryCount + 1);
        }

        console.error(`❌ [Worker ${workerData?.workerId || 'Main'}] Failed: ${url} - ${error.message}`);
        return {
            success: false,
            error: error.message,
            status: error.message.match(/HTTP (\d+)/)?.[1] || 'Unknown',
            userAgent: userAgent || 'Unknown'
        };
    }
}

// Worker thread function
if (!isMainThread) {
    (async () => {
        try {
            const result = await scrapeWithRetry(workerData.url);
            parentPort.postMessage({
                workerId: workerData.workerId,
                ...result
            });
        } catch (error) {
            parentPort.postMessage({
                workerId: workerData.workerId,
                success: false,
                error: error.message
            });
        }
    })();
}

// Main thread - manages worker threads
async function runConcurrentScraping() {
    // YouTube video URL from .env file, or use default
    const url = process.env.YOUTUBE_VIDEO_URL || 'https://www.youtube.com/watch?v=P6mvufMyHQQ';
    const workers = [];
    const results = {
        successful: 0,
        failed: 0,
        total: 0,
        userAgents: new Set(),
        viewports: new Set()
    };

    console.log(`🚀 Starting concurrent scraping with Chrome Headless`);
    console.log(`📊 Configuration: ${CONFIG.maxConcurrent} concurrent workers, ${CONFIG.totalRequests} total requests`);
    console.log(`📦 Using modern Chrome user agents for realistic browser fingerprints`);
    
    // Fetch proxies based on mode
    if (CONFIG.proxyMode === 'proxifly') {
        try {
            await fetchProxiflyProxies();
            console.log(`🔐 Proxifly mode enabled - rotating through ${proxiflyProxies.length} proxies`);
        } catch (error) {
            console.error(`❌ Failed to initialize Proxifly: ${error.message}`);
            console.log('⚠️  Falling back to direct connection (no proxy)');
            CONFIG.proxyMode = 'none'; // Fallback to no proxy
        }
    } else if (CONFIG.proxyMode === 'free-proxy-list') {
        try {
            await fetchFreeProxyList(0);
            console.log(`🔐 Free proxy list mode enabled - rotating through ${freeProxyList.length} proxies`);
            console.log(`   Sources: ${CONFIG.freeProxyList.sources.length} proxy list URLs configured`);
        } catch (error) {
            console.error(`❌ Failed to initialize free proxy list: ${error.message}`);
            console.log('⚠️  Falling back to direct connection (no proxy)');
            CONFIG.proxyMode = 'none'; // Fallback to no proxy
        }
    } else if (CONFIG.proxyMode === 'direct') {
        console.log(`🔐 Direct proxy enabled: ${CONFIG.proxy.protocol}://${CONFIG.proxy.host}:${CONFIG.proxy.port}`);
    } else {
        console.log(`🌐 No proxy configured - using direct connection`);
    }
    console.log('');

    // Create workers in batches
    for (let batch = 0; batch < Math.ceil(CONFIG.totalRequests / CONFIG.maxConcurrent); batch++) {
        const batchPromises = [];

        for (let i = 0; i < CONFIG.maxConcurrent; i++) {
            const requestNumber = batch * CONFIG.maxConcurrent + i;
            if (requestNumber >= CONFIG.totalRequests) break;

            const worker = new Worker(__filename, {
                workerData: {
                    url,
                    workerId: requestNumber + 1
                }
            });

            const promise = new Promise((resolve) => {
                worker.on('message', (result) => {
                    results.total++;
                    if (result.success) {
                        results.successful++;
                        if (result.userAgent) results.userAgents.add(result.userAgent);
                        if (result.viewport) results.viewports.add(`${result.viewport.width}x${result.viewport.height}`);
                    } else {
                        results.failed++;
                    }
                    resolve(result);
                });

                worker.on('error', (error) => {
                    console.error(`Worker error: ${error.message}`);
                    results.total++;
                    results.failed++;
                    resolve({ success: false, error: error.message });
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`Worker stopped with exit code ${code}`);
                    }
                });
            });

            batchPromises.push(promise);
            workers.push(worker);
        }

        // Wait for current batch to complete
        const batchResults = await Promise.allSettled(batchPromises);
        console.log(`📦 Batch ${batch + 1} completed - Success: ${results.successful}, Failed: ${results.failed}, Total: ${results.total}`);

        // Longer delay between batches to be respectful with browsers
        if (batch < Math.ceil(CONFIG.totalRequests / CONFIG.maxConcurrent) - 1) {
            const batchDelay = 3000 + Math.random() * 4000; // 3-7 seconds
            console.log(`💤 Waiting ${Math.round(batchDelay/1000)}s before next batch...\n`);
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }

    // Cleanup
    workers.forEach(worker => {
        try {
            worker.terminate();
        } catch (error) {
            // Silent cleanup
        }
    });

    console.log('\n📊 Final Results:');
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.successful / results.total) * 100).toFixed(2)}%`);
    console.log(`🌐 Unique User Agents: ${results.userAgents.size}`);
    console.log(`🖥️  Unique Viewports: ${results.viewports.size}`);
    
    // Show proxy statistics if using proxies
    if (CONFIG.proxyMode === 'proxifly' || CONFIG.proxyMode === 'free-proxy-list') {
        const proxyStats = getProxyStats();
        const modeName = CONFIG.proxyMode === 'proxifly' ? 'Proxifly' : 'Free Proxy List';
        console.log(`🔐 ${modeName} Stats: ${proxyStats.totalUsed} unique proxies used (no repetitions)`);
    }

    return results;
}

// Sequential scraper (runs totalRequests times, one at a time)
async function runSequentialScraping() {
    // YouTube video URL from .env file, or use default
    const url = process.env.YOUTUBE_VIDEO_URL || 'https://www.youtube.com/watch?v=P6mvufMyHQQ';
    const results = {
        successful: 0,
        failed: 0,
        total: 0,
        userAgents: new Set(),
        viewports: new Set()
    };

    console.log(`🚀 Starting sequential scraping`);
    console.log(`📊 Configuration: ${CONFIG.totalRequests} total requests (one at a time)`);
    
    // Fetch proxies based on mode
    if (CONFIG.proxyMode === 'proxifly') {
        try {
            await fetchProxiflyProxies();
            console.log(`🔐 Proxifly mode enabled - rotating through ${proxiflyProxies.length} proxies`);
        } catch (error) {
            console.error(`❌ Failed to initialize Proxifly: ${error.message}`);
            console.log('⚠️  Falling back to direct connection (no proxy)');
            CONFIG.proxyMode = 'none'; // Fallback to no proxy
        }
    } else if (CONFIG.proxyMode === 'free-proxy-list') {
        try {
            await fetchFreeProxyList(0);
            console.log(`🔐 Free proxy list mode enabled - rotating through ${freeProxyList.length} proxies`);
            console.log(`   Sources: ${CONFIG.freeProxyList.sources.length} proxy list URLs configured`);
        } catch (error) {
            console.error(`❌ Failed to initialize free proxy list: ${error.message}`);
            console.log('⚠️  Falling back to direct connection (no proxy)');
            CONFIG.proxyMode = 'none'; // Fallback to no proxy
        }
    } else if (CONFIG.proxyMode === 'direct') {
        console.log(`🔐 Direct proxy enabled: ${CONFIG.proxy.protocol}://${CONFIG.proxy.host}:${CONFIG.proxy.port}`);
    } else {
        console.log(`🌐 No proxy configured - using direct connection`);
    }
    console.log('');

    for (let i = 0; i < CONFIG.totalRequests; i++) {
        console.log(`\n🔄 Request ${i + 1}/${CONFIG.totalRequests}`);
        const result = await scrapeWithRetry(url);
        
        results.total++;
        if (result.success) {
            results.successful++;
            if (result.userAgent) results.userAgents.add(result.userAgent);
            if (result.viewport) results.viewports.add(`${result.viewport.width}x${result.viewport.height}`);
        } else {
            results.failed++;
        }

        // Delay between requests (except after the last one)
        if (i < CONFIG.totalRequests - 1) {
            const delay = 3000 + Math.random() * 4000; // 3-7 seconds
            console.log(`💤 Waiting ${Math.round(delay/1000)}s before next request...\n`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    console.log('\n📊 Final Results:');
    console.log(`✅ Successful: ${results.successful}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.successful / results.total) * 100).toFixed(2)}%`);
    console.log(`🌐 Unique User Agents: ${results.userAgents.size}`);
    console.log(`🖥️  Unique Viewports: ${results.viewports.size}`);
    
    // Show proxy statistics if using proxies
    if (CONFIG.proxyMode === 'proxifly' || CONFIG.proxyMode === 'free-proxy-list') {
        const proxyStats = getProxyStats();
        const modeName = CONFIG.proxyMode === 'proxifly' ? 'Proxifly' : 'Free Proxy List';
        console.log(`🔐 ${modeName} Stats: ${proxyStats.totalUsed} unique proxies used (no repetitions)`);
    }

    return results;
}

// Main execution
if (isMainThread) {
    (async () => {
        try {
            if (CONFIG.maxConcurrent > 1) {
                await runConcurrentScraping();
            } else {
                await runSequentialScraping();
            }
        } catch (error) {
            console.error('Scraping failed:', error);
        }
    })();
}
