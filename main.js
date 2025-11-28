import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

// Initialize the Actor
await Actor.init();

// Get the input from the actor's input schema
const input = await Actor.getInput();

// Validate input
if (!input.directUrls || input.directUrls.length === 0) {
    throw new Error('You need to provide at least one Instagram URL');
}

const resultsLimit = input.resultsLimit || 10;
const resultsType = input.resultsType || 'posts';

// Create the crawler with proper configuration
const crawler = new CheerioCrawler({
    useSessionPool: true,
    persistCookiesPerSession: true,
    maxRequestsPerCrawl: 100,
    maxRequestRetries: 5,
    maxConcurrency: 1,
    navigationTimeoutSecs: 30,
});

// Helper function to extract Instagram username from URL
function extractUsernameFromUrl(url) {
    const match = url.match(/instagram\.com\/([^/?]+)/);
    return match ? match[1] : null;
}

// Helper function to extract post shortcode from URL
function extractShortcodeFromUrl(url) {
    const match = url.match(/instagram\.com\/p\/([^/?]+)/);
    return match ? match[1] : null;
}

// Handle page routing
crawler.router.addDefaultHandler(async (context) => {
    const { request, log } = context;

    log.info(`Processing ${request.url}`);

    try {
        // Determine the type of page and scrape accordingly
        if (request.url.includes('/p/') || request.url.includes('/reel/')) {
            // This is a post/reel page
            await scrapePost(request.url, log);
        } else if (request.url.includes('instagram.com/') && !request.url.includes('/explore/')) {
            // This is a profile page
            await scrapeProfile(request.url, log);
        }
    } catch (error) {
        log.warning(`Error processing ${request.url}: ${error.message}`);
    }
});

/**
 * Scrape Instagram profile data using the web API
 */
async function scrapeProfile(url, log) {
    try {
        const username = extractUsernameFromUrl(url);
        if (!username) {
            log.warning(`Could not extract username from ${url}`);
            return;
        }

        log.info(`Scraping profile: ${username}`);

        // Fetch the profile page to get initial data
        const response = await fetch(`https://www.instagram.com/${username}/?__a=1&__w=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.instagram.com/',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch profile ${username}: ${response.status}`);
            return;
        }

        const html = await response.text();

        // Extract JSON data from the HTML
        const jsonMatch = html.match(/<script type="application\/json" id="__A_APP_DATA">(.*?)<\/script>/);
        if (!jsonMatch) {
            log.warning(`Could not find JSON data for profile ${username}`);
            return;
        }

        const jsonData = JSON.parse(jsonMatch[1]);
        const user = jsonData?.nativeState?.feed?.user_detail?.user;

        if (user) {
            const profileData = {
                url: url,
                type: 'profile',
                username: user.username,
                name: user.full_name || '',
                bio: user.biography || '',
                followers: user.follower_count || 0,
                following: user.following_count || 0,
                posts: user.media_count || 0,
                isVerified: user.is_verified || false,
                isPrivate: user.is_private || false,
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(profileData);
            log.info(`Successfully scraped profile: ${username}`);

            // If requested, scrape posts from profile
            if (resultsType === 'posts' || resultsType === 'reels') {
                await scrapeProfilePosts(username, log);
            }
        } else {
            log.warning(`Could not extract user data from profile ${username}`);
        }
    } catch (error) {
        log.warning(`Failed to scrape profile ${url}: ${error.message}`);
    }
}

/**
 * Scrape posts from a profile
 */
async function scrapeProfilePosts(username, log) {
    try {
        log.info(`Scraping posts from profile: ${username}`);

        const response = await fetch(`https://www.instagram.com/${username}/?__a=1&__w=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.instagram.com/',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch posts for ${username}: ${response.status}`);
            return;
        }

        const html = await response.text();

        // Extract JSON data from the HTML
        const jsonMatch = html.match(/<script type="application\/json" id="__A_APP_DATA">(.*?)<\/script>/);
        if (!jsonMatch) {
            log.warning(`Could not find JSON data for posts from ${username}`);
            return;
        }

        const jsonData = JSON.parse(jsonMatch[1]);
        const posts = jsonData?.nativeState?.feed?.timeline?.edges || [];

        let postCount = 0;
        for (const edge of posts.slice(0, resultsLimit)) {
            const node = edge.node;
            if (node && node.id) {
                const postData = {
                    url: `https://www.instagram.com/p/${node.shortcode}/`,
                    type: 'post',
                    username: username,
                    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                    likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                    comments: node.edge_media_to_comment?.count || 0,
                    timestamp: node.taken_at_timestamp || new Date().getTime(),
                    mediaType: node.__typename || 'image',
                    scrapedAt: new Date().toISOString(),
                };

                await Actor.pushData(postData);
                postCount++;
            }
        }

        log.info(`Scraped ${postCount} posts from ${username}`);
    } catch (error) {
        log.warning(`Failed to scrape posts from ${username}: ${error.message}`);
    }
}

/**
 * Scrape Instagram post data
 */
async function scrapePost(url, log) {
    try {
        const shortcode = extractShortcodeFromUrl(url);
        if (!shortcode) {
            log.warning(`Could not extract shortcode from ${url}`);
            return;
        }

        log.info(`Scraping post: ${shortcode}`);

        const response = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__w=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.instagram.com/',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch post ${shortcode}: ${response.status}`);
            return;
        }

        const html = await response.text();

        // Extract JSON data from the HTML
        const jsonMatch = html.match(/<script type="application\/json" id="__A_APP_DATA">(.*?)<\/script>/);
        if (!jsonMatch) {
            log.warning(`Could not find JSON data for post ${shortcode}`);
            return;
        }

        const jsonData = JSON.parse(jsonMatch[1]);
        const post = jsonData?.nativeState?.feed?.post?.media;

        if (post) {
            const postData = {
                url: url,
                type: 'post',
                username: post.owner?.username || '',
                caption: post.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                likes: post.edge_liked_by?.count || post.edge_media_preview_like?.count || 0,
                comments: post.edge_media_to_comment?.count || 0,
                timestamp: post.taken_at_timestamp || new Date().getTime(),
                mediaType: post.__typename || 'image',
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(postData);
            log.info(`Successfully scraped post: ${shortcode}`);

            // If requested, scrape comments
            if (resultsType === 'comments') {
                await scrapeComments(shortcode, log);
            }
        } else {
            log.warning(`Could not extract post data from ${shortcode}`);
        }
    } catch (error) {
        log.warning(`Failed to scrape post ${url}: ${error.message}`);
    }
}

/**
 * Scrape comments from a post
 */
async function scrapeComments(shortcode, log) {
    try {
        log.info(`Scraping comments from post: ${shortcode}`);

        const response = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__w=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.instagram.com/',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch comments for ${shortcode}: ${response.status}`);
            return;
        }

        const html = await response.text();

        // Extract JSON data from the HTML
        const jsonMatch = html.match(/<script type="application\/json" id="__A_APP_DATA">(.*?)<\/script>/);
        if (!jsonMatch) {
            log.warning(`Could not find JSON data for comments from ${shortcode}`);
            return;
        }

        const jsonData = JSON.parse(jsonMatch[1]);
        const comments = jsonData?.nativeState?.feed?.post?.comments?.edges || [];

        let commentCount = 0;
        for (const edge of comments.slice(0, resultsLimit)) {
            const node = edge.node;
            if (node) {
                const commentData = {
                    type: 'comment',
                    postShortcode: shortcode,
                    username: node.owner?.username || '',
                    text: node.text || '',
                    likes: node.edge_liked_by?.count || 0,
                    timestamp: node.created_at || new Date().getTime(),
                    scrapedAt: new Date().toISOString(),
                };

                await Actor.pushData(commentData);
                commentCount++;
            }
        }

        log.info(`Scraped ${commentCount} comments from ${shortcode}`);
    } catch (error) {
        log.warning(`Failed to scrape comments from ${shortcode}: ${error.message}`);
    }
}

// Add direct URLs to the crawler queue
if (input.directUrls && input.directUrls.length > 0) {
    const urls = input.directUrls.map((url) => ({
        url: url.includes('instagram.com') ? url : `https://www.instagram.com/${url}`,
        uniqueKey: url,
    }));

    await crawler.addRequests(urls);
}

// Run the crawler
await crawler.run();

// Exit the actor
await Actor.exit();
