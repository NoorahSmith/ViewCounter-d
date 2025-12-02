# ViewCounter-d
YT Some view enhancer
# YouTube Video Interaction 

A sophisticated YouTube video interaction Tester with multiple proxy modes, realistic browsing behavior, and automatic proxy management. This Tester simulates human-like video viewing patterns on YouTube while supporting various proxy configurations for enhanced privacy and geographic diversity.

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Proxy Modes](#-proxy-modes)
- [Usage Examples](#-usage-examples)
- [Advanced Features](#-advanced-features)
- [Troubleshooting](#-troubleshooting)
- [Best Practices](#-best-practices)
- [Security](#-security)

## ✨ Features

- 🎭 **Realistic Browser Simulation**: Random user agents, viewports, and human-like video interaction patterns
- 🔄 **Multiple Proxy Modes**: Choose between no proxy, direct proxy, Proxifly API, or free proxy lists
- 🔐 **Smart Proxy Management**: Automatic proxy rotation with zero repetition
- ♻️ **Auto-Refetch**: Automatically fetches new proxies when current pool is exhausted
- 🌍 **Geographic Diversity**: Support for 100+ countries via Proxifly
- 📊 **Detailed Statistics**: Track success rates, proxy usage, and performance metrics
- 🎬 **Human-like Interactions**: Random seeks, pauses, and watch patterns
- 🚀 **Concurrent Processing**: Support for parallel workers with rate limiting
- 🛡️ **Anti-Detection**: Modern Chrome user agents and realistic browser fingerprints

## 🚀 Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager

### Step 1: Clone or Download

```bash
git clone https://github.com/NoorahSmith/ViewCounter-d.git
cd ViewCounter-d.git
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- `puppeteer` - Browser automation
- `proxifly` - Proxy API client (optional, for Proxifly mode)
- `random-useragent` - User agent randomization
- `dotenv` - Environment variable management

### Step 3: Environment Setup

Create a `.env` file in the project root:

```bash
# .env
# Proxifly API Key (required if using proxifly mode)
# Get your API key from: https://proxifly.dev/
PROXIFLY_API_KEY=your_proxifly_api_key_here

# YouTube Video URL (optional, defaults to example video)
# The YouTube video URL to interact with
YOUTUBE_VIDEO_URL=https://www.youtube.com/watch?v=P6mvufMyHQQ
```

**Get your Proxifly API key from**: https://proxifly.dev/

> **Note**: The `.env` file is already in `.gitignore` to keep your API key secure. Never commit this file to version control.

## 🎯 Quick Start

### Basic Usage (No Proxy)

1. Open `code.js` and set the configuration:

```javascript
const CONFIG = {
    proxyMode: 'none',  // No proxy
    maxConcurrent: 1,
    totalRequests: 10,
    // ... other settings
};
```

2. Run the Tester:

```bash
node code.js
```

### Using Free Proxy Lists (Recommended for Testing)

1. Configure for free proxy lists:

```javascript
const CONFIG = {
    proxyMode: 'free-proxy-list',  // Use free proxies
    maxConcurrent: 1,
    totalRequests: 50,
    // ... other settings
};
```

2. Run the Tester:

```bash
node code.js
```

The Tester will automatically fetch proxies from free CDN sources (no API key needed).

## ⚙️ Configuration

### Main Configuration Object

All settings are in the `CONFIG` object at the top of `code.js`:

```javascript
const CONFIG = {
    // Retry settings
    maxRetries: 5,
    backoffDelays: [1000, 3000, 5000, 9000, 15000],
    
    // Execution settings
    maxConcurrent: 5,        // Number of parallel workers
    totalRequests: 250,      // Total requests to make
    timeout: 160000,         // Request timeout in milliseconds
    
    // Browser settings
    viewport: { width: 1920, height: 1080 },
    
    // Proxy mode: 'none', 'direct', 'proxifly', 'free-proxy-list'
    proxyMode: 'free-proxy-list',
    
    // ... proxy configurations (see below)
};
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxRetries` | number | 5 | Maximum retry attempts for failed requests |
| `backoffDelays` | array | [1000, 3000, 5000, 9000, 15000] | Exponential backoff delays (ms) |
| `maxConcurrent` | number | 5 | Number of parallel browser instances |
| `totalRequests` | number | 250 | Total number of requests to make |
| `timeout` | number | 160000 | Page load timeout (ms) |
| `viewport` | object | { width: 1920, height: 1080 } | Browser viewport size |
| `proxyMode` | string | 'free-proxy-list' | Proxy mode to use |

## 🔄 Proxy Modes

### 1. No Proxy Mode

Direct connection without any proxy. Use for testing or when proxies aren't needed.

```javascript
proxyMode: 'none'
```

**When to use:**
- Local testing
- Development
- When you don't need proxy protection

**Example:**
```javascript
const CONFIG = {
    proxyMode: 'none',
    maxConcurrent: 1,
    totalRequests: 10
};
```

### 2. Direct Proxy Mode

Use your own proxy server (SOCKS5, SOCKS4, or HTTP).

```javascript
proxyMode: 'direct',
proxy: {
    protocol: 'socks5',    // 'socks5', 'socks4', or 'http'
    host: '127.0.0.1',     // Proxy server address
    port: 9150,            // Proxy server port
    username: '',          // Optional: Proxy username
    password: ''           // Optional: Proxy password
}
```

**When to use:**
- You have your own proxy server
- Using Tor (localhost:9150)
- Corporate proxies
- VPN proxies

**Example with Tor:**
```javascript
const CONFIG = {
    proxyMode: 'direct',
    proxy: {
        protocol: 'socks5',
        host: '127.0.0.1',
        port: 9150,
        username: '',
        password: ''
    },
    maxConcurrent: 1,
    totalRequests: 50
};
```

**Example with authenticated proxy:**
```javascript
const CONFIG = {
    proxyMode: 'direct',
    proxy: {
        protocol: 'http',
        host: 'proxy.example.com',
        port: 8080,
        username: 'myuser',
        password: 'mypassword'
    },
    maxConcurrent: 1,
    totalRequests: 50
};
```

### 3. Proxifly Mode

Automatically fetch and rotate proxies from [Proxifly API](https://proxifly.dev/).

```javascript
proxyMode: 'proxifly',
proxifly: {
    apiKey: process.env.PROXIFLY_API_KEY,  // From .env file
    protocol: 'http',                      // 'http' | 'socks4' | 'socks5'
    anonymity: 'elite',                    // 'transparent' | 'anonymous' | 'elite'
    country: 'US',                         // ISO 3166-1 alpha-2 country code
    https: true,                           // Require HTTPS support
    speed: 10000,                          // Max response time (0-60000 ms)
    format: 'json',                        // 'json' | 'text'
    quantity: 20,                          // Proxies per fetch (1-20)
    rotateProxies: true                    // Sequential rotation
}
```

**When to use:**
- Production environments
- Need high-quality proxies
- Want automatic proxy management
- Need specific country targeting

**Configuration Options:**

| Option | Type | Values | Description |
|--------|------|--------|-------------|
| `apiKey` | string | - | Your Proxifly API key (from .env) |
| `protocol` | string | 'http', 'socks4', 'socks5' | Proxy protocol type |
| `anonymity` | string | 'transparent', 'anonymous', 'elite' | Anonymity level (elite recommended) |
| `country` | string | ISO codes | Single country code (e.g., 'US', 'GB', 'CA') |
| `https` | boolean | true, false | Require HTTPS support |
| `speed` | number | 0-60000 | Maximum response time in ms |
| `format` | string | 'json', 'text' | Response format |
| `quantity` | number | 1-20 | Number of proxies per API call |
| `rotateProxies` | boolean | true, false | Use proxies sequentially |

**Example - US Elite Proxies:**
```javascript
const CONFIG = {
    proxyMode: 'proxifly',
    proxifly: {
        apiKey: process.env.PROXIFLY_API_KEY,
        protocol: 'http',
        anonymity: 'elite',
        country: 'US',
        https: true,
        speed: 10000,
        format: 'json',
        quantity: 15,
        rotateProxies: true
    },
    maxConcurrent: 1,
    totalRequests: 100
};
```

**Example - Fast SOCKS5 Proxies:**
```javascript
const CONFIG = {
    proxyMode: 'proxifly',
    proxifly: {
        apiKey: process.env.PROXIFLY_API_KEY,
        protocol: 'socks5',
        anonymity: 'elite',
        country: 'CA',
        https: true,
        speed: 5000,  // Fast proxies only
        format: 'json',
        quantity: 20,
        rotateProxies: true
    },
    maxConcurrent: 1,
    totalRequests: 500
};
```

### 4. Free Proxy List Mode

Fetches proxies directly from free proxy list CDN sources (no API key needed).

```javascript
proxyMode: 'free-proxy-list',
freeProxyList: {
    sources: [
        {
            url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt',
            protocol: 'socks5',
            priority: 1  // Try this first
        },
        {
            url: 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt',
            protocol: 'http',
            priority: 2  // Fallback
        }
    ],
    rotateProxies: true,
    fetchOnStart: true
}
```

**When to use:**
- Testing and development
- No budget for paid proxies
- Learning and experimentation
- Low-volume operations

**Features:**
- ✅ No API key required
- ✅ Automatic fallback between sources
- ✅ SOCKS5 proxies tried first, then all proxies
- ✅ Zero repetition tracking
- ✅ Auto-refetch when pool exhausted

**Example:**
```javascript
const CONFIG = {
    proxyMode: 'free-proxy-list',
    maxConcurrent: 1,
    totalRequests: 50
};
```

## 📚 Usage Examples

### Example 1: Simple Test Run (No Proxy)

Perfect for initial testing and development.

```javascript
const CONFIG = {
    maxRetries: 3,
    backoffDelays: [1000, 2000, 3000],
    maxConcurrent: 1,
    totalRequests: 5,
    timeout: 60000,
    viewport: { width: 1920, height: 1080 },
    proxyMode: 'none'
};
```

**Run:**
```bash
node code.js
```

**Expected Output:**
```
🚀 Starting sequential scraping
📊 Configuration: 5 total requests (one at a time)
🌐 No proxy configured - using direct connection

🔄 Request 1/5
🌐 [Worker Main] Visiting: https://www.youtube.com/watch?v=P6mvufMyHQQ
   User Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...
   Viewport: 1920x1080
   Proxy: None (Direct connection)
⏳ [Worker Main] Waiting for video player...
📊 [Worker Main] View Count: 1.2M views
🎬 [Worker Main] Video Interaction Complete:
   Duration: 5m 30s
   ✓ Video started playing from beginning
   ✓ Seeked to 0m 45s (15.2% of video)
   ✓ Video paused at 0m 45s
   ✓ Resumed and seeked to 3m 20s (60.6% of video)
   ✓ Jumped near end to 5m 15s
   ✓ Video stopped
✅ [Worker Main] Success: https://www.youtube.com/watch?v=P6mvufMyHQQ
   Title: "Video Title..."
   Status: 200, Content: 245678 chars

📊 Final Results:
✅ Successful: 5
❌ Failed: 0
📈 Success Rate: 100.00%
🌐 Unique User Agents: 5
🖥️  Unique Viewports: 4
```

### Example 2: Production Run with Free Proxy Lists

Using free proxies for a larger operation.

```javascript
const CONFIG = {
    maxRetries: 5,
    backoffDelays: [1000, 3000, 5000, 9000, 15000],
    maxConcurrent: 3,
    totalRequests: 100,
    timeout: 160000,
    viewport: { width: 1920, height: 1080 },
    proxyMode: 'free-proxy-list'
};
```

**Run:**
```bash
node code.js
```

**Expected Output:**
```
🚀 Starting concurrent scraping with Chrome Headless
📊 Configuration: 3 concurrent workers, 100 total requests
📦 Using modern Chrome user agents for realistic browser fingerprints
🔄 Fetching free proxies from source 1/2...
   URL: https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt
   Protocol: socks5
📥 Received 150 proxies from source
🔄 Filtered: 150 -> 150 proxies (0 already used)
✅ Loaded 150 unique proxies from free proxy list (0 total used so far)
🔐 Free proxy list mode enabled - rotating through 150 proxies
   Sources: 2 proxy list URLs configured

📦 Batch 1 completed - Success: 3, Failed: 0, Total: 3
💤 Waiting 4s before next batch...

📊 Final Results:
✅ Successful: 95
❌ Failed: 5
📈 Success Rate: 95.00%
🌐 Unique User Agents: 95
🖥️  Unique Viewports: 12
🔐 Free Proxy List Stats: 100 unique proxies used (no repetitions)
```

### Example 3: High-Volume with Proxifly

Production setup with Proxifly API for maximum reliability.

```javascript
const CONFIG = {
    maxRetries: 5,
    backoffDelays: [1000, 3000, 5000, 9000, 15000],
    maxConcurrent: 5,
    totalRequests: 250,
    timeout: 160000,
    viewport: { width: 1920, height: 1080 },
    proxyMode: 'proxifly',
    proxifly: {
        apiKey: process.env.PROXIFLY_API_KEY,
        protocol: 'http',
        anonymity: 'elite',
        country: 'US',
        https: true,
        speed: 10000,
        format: 'json',
        quantity: 20,
        rotateProxies: true
    }
};
```

**Setup `.env` file:**
```bash
PROXIFLY_API_KEY=your_actual_api_key_here
```

**Run:**
```bash
node code.js
```

### Example 4: Tor Proxy Setup

Using local Tor instance for maximum anonymity.

```javascript
const CONFIG = {
    maxRetries: 5,
    backoffDelays: [1000, 3000, 5000, 9000, 15000],
    maxConcurrent: 1,  // Tor works best with single connection
    totalRequests: 50,
    timeout: 160000,
    viewport: { width: 1920, height: 1080 },
    proxyMode: 'direct',
    proxy: {
        protocol: 'socks5',
        host: '127.0.0.1',
        port: 9150,  // Tor Browser default port
        username: '',
        password: ''
    }
};
```

**Prerequisites:**
- Tor Browser installed and running
- SOCKS5 proxy enabled on port 9150

**Run:**
```bash
# Start Tor Browser first, then:
node code.js
```

### Example 5: Custom Proxy Server

Using your own proxy server with authentication.

```javascript
const CONFIG = {
    maxRetries: 5,
    backoffDelays: [1000, 3000, 5000, 9000, 15000],
    maxConcurrent: 2,
    totalRequests: 100,
    timeout: 160000,
    viewport: { width: 1920, height: 1080 },
    proxyMode: 'direct',
    proxy: {
        protocol: 'http',
        host: 'proxy.example.com',
        port: 8080,
        username: 'myuser',
        password: 'mypassword'
    }
};
```

## 🎯 Advanced Features

### Smart Proxy Management

The Tester includes intelligent proxy management:

- **Zero Repetition**: Each proxy is used exactly once
- **Automatic Refetch**: Fetches new proxies when pool is exhausted
- **Smart Filtering**: Filters out previously used proxies from new batches
- **Source Rotation**: Automatically switches between proxy sources
- **Graceful Fallback**: Falls back to direct connection if all sources fail

### Realistic Browser Simulation

- **Random User Agents**: Modern Chrome versions (117-123) across platforms
- **Diverse Viewports**: Desktop, laptop, and MacBook resolutions
- **Human-like Interactions**:
  - Random seek positions (10-40% and 50-80% of video)
  - Natural pause/resume patterns
  - Variable watch times (2-7 seconds)
  - Jump to end behavior
  - Random delays between actions

### Video Interaction Pattern

The Tester simulates realistic viewing:

1. **Start**: Video begins playing from the beginning
2. **Seek 1**: Jumps to random position (10-40% of video)
3. **Pause**: Pauses the video (like user doing something else)
4. **Resume**: Resumes and seeks to another position (50-80%)
5. **End Check**: Jumps near the end to check conclusion
6. **Stop**: Pauses the video

### Resource Optimization

- Blocks unnecessary resources (images, fonts)
- Efficient browser cleanup
- Configurable delays between requests
- Memory-efficient worker management

## 🔧 Troubleshooting

### Common Issues

#### "No proxies returned from Proxifly API"

**Causes:**
- Invalid API key
- No credits on Proxifly account
- Invalid country code
- Unsupported protocol

**Solutions:**
```javascript
// Verify API key in .env
PROXIFLY_API_KEY=your_key_here

// Check Proxifly dashboard for credits
// Verify country code format (ISO 3166-1 alpha-2)
country: 'US'  // ✅ Correct
country: 'United States'  // ❌ Wrong

// Try different protocol
protocol: 'http'  // Most common
```

#### "Unable to fetch new unique proxies after 5 attempts"

**Causes:**
- All available proxies for configuration have been used
- Too restrictive filters (country, speed, anonymity)

**Solutions:**
```javascript
// Increase quantity to get more proxies per fetch
quantity: 20  // Maximum

// Try different country
country: 'US'  // Try other countries

// Relax speed requirement
speed: 30000  // Allow slower proxies

// Try different anonymity level
anonymity: 'anonymous'  // Less restrictive than 'elite'
```

#### "Failed to initialize Proxifly"

**Causes:**
- Network connectivity issues
- Proxifly API down
- Invalid API key

**Solutions:**
- Check internet connection
- Verify Proxifly API status
- Check API key in `.env` file
- Tester will automatically fall back to direct connection

#### "Failed to fetch proxies from free proxy list"

**Causes:**
- CDN source unavailable
- Network issues
- All proxies from sources already used

**Solutions:**
- Check internet connection
- Wait and retry (CDN may be temporarily down)
- Tester automatically tries next source
- Falls back to direct connection if all sources fail

#### Browser Launch Errors

**Causes:**
- Insufficient system resources
- Too many concurrent instances
- Missing dependencies

**Solutions:**
```javascript
// Reduce concurrent workers
maxConcurrent: 1  // Start with 1

// Increase system resources
// Close other applications
// Check available RAM/CPU
```

### Debug Mode

Enable detailed logging by checking console output. The Tester provides extensive logging:

- 🔄 Proxy fetching operations
- 🌐 Request details (URL, user agent, viewport)
- 🔐 Proxy information
- ⏳ Wait states
- 📊 Statistics
- ✅ Success indicators
- ❌ Error messages

## 💡 Best Practices

### 1. Start Small

Begin with small request counts to test your configuration:

```javascript
totalRequests: 10,
maxConcurrent: 1
```

### 2. Use Appropriate Proxy Mode

- **Testing**: Use `'free-proxy-list'` or `'none'`
- **Production**: Use `'proxifly'` for reliability
- **Maximum Privacy**: Use `'direct'` with Tor

### 3. Respect Rate Limits

- Add delays between requests
- Don't set `maxConcurrent` too high
- Monitor success rates

### 4. Monitor Statistics

Watch the final statistics:
- Success rate should be >90%
- If lower, check proxy quality or reduce concurrency

### 5. Proxy Quality

- **Elite anonymity**: Best for avoiding detection
- **HTTPS support**: More reliable
- **Speed**: Balance between speed and availability

### 6. Error Handling

The Tester includes automatic:
- Retry logic with exponential backoff
- Proxy rotation on failure
- Graceful fallback mechanisms

## 🔒 Security

### API Key Security

- ✅ API key stored in `.env` file (not in code)
- ✅ `.env` file in `.gitignore`
- ✅ Never commit `.env` to version control
- ✅ Use environment variables in production

### Proxy Security

- Use HTTPS proxies when possible
- Elite anonymity proxies for maximum privacy
- Rotate proxies frequently
- Never reuse proxies

### Best Practices

1. **Never hardcode credentials**:
   ```javascript
   // ❌ Bad
   apiKey: 'hardcoded_key_here'
   
   // ✅ Good
   apiKey: process.env.PROXIFLY_API_KEY
   ```

2. **Use `.env` for all secrets and configuration**:
   ```bash
   # .env
   PROXIFLY_API_KEY=your_key
   YOUTUBE_VIDEO_URL=https://www.youtube.com/watch?v=YOUR_VIDEO_ID
   PROXY_USERNAME=user
   PROXY_PASSWORD=pass
   ```

3. **Review `.gitignore`**:
   ```bash
   # Ensure .env is ignored
   .env
   .env.local
   .env.*.local
   ```

## 📊 Understanding Output

### Success Indicators

```
✅ [Worker Main] Success: https://www.youtube.com/watch?v=...
   Title: "Video Title"
   Status: 200, Content: 245678 chars
```

### Proxy Information

```
🔐 Using Proxifly proxy: http://1.2.3.4:8080 (US)
```

### Statistics

```
📊 Final Results:
✅ Successful: 95
❌ Failed: 5
📈 Success Rate: 95.00%
🌐 Unique User Agents: 95
🖥️  Unique Viewports: 12
🔐 Free Proxy List Stats: 100 unique proxies used (no repetitions)
```

## 🎓 Learning Resources

- [Puppeteer Documentation](https://pptr.dev/)
- [Proxifly Documentation](https://proxifly.dev/)
- [YouTube Terms of Service](https://www.youtube.com/static?template=terms)

## ⚠️ Disclaimer

This tool is for **educational purposes only**. Users are responsible for:

- Complying with YouTube's Terms of Service
- Following applicable laws and regulations
- Respecting rate limits and server resources
- Using proxies ethically and legally

**The authors and contributors are not responsible for any misuse of this software.**

## 📝 License

ISC

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📧 Support

For issues and questions:
- Check the [Troubleshooting](#-troubleshooting) section
- Review existing GitHub issues
- Create a new issue with detailed information

---

**Happy Testerting! 🚀**
