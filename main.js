import { Actor } from 'apify';
import { CheerioCrawler, Configuration } from 'crawlee';

// Initialize the Actor
await Actor.init();

// Get the input from the actor's input schema
const input = await Actor.getInput();

// Validate input
if (!input.directUrls && !input.search) {
    throw new Error('You need to provide either directUrls or search query');
}

const resultsLimit = input.resultsLimit || 10;
const resultsType = input.resultsType || 'posts';
const searchLimit = input.searchLimit || 10;

// Configuration for the crawler
const crawlerConfig = new Configuration({
    persistStateKeyValueStoreId: 'default',
});

// Create the crawler
const crawler = new CheerioCrawler(
    {
        useSessionPool: true,
        persistCookiesPerSession: true,
        maxRequestsPerCrawl: 1000,
        maxRequestRetries: 3,
    },
    crawlerConfig,
);

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

// Helper function to fetch data from Instagram's GraphQL API
async function fetchInstagramGraphQL(query, variables, session) {
    const url = 'https://www.instagram.com/api/graphql';
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.instagram.com/',
        },
        body: new URLSearchParams({
            query_hash: query,
            variables: JSON.stringify(variables),
        }),
    });

    if (!response.ok) {
        throw new Error(`Instagram API error: ${response.status}`);
    }

    return response.json();
}

// Handle page routing
crawler.router.addDefaultHandler(async (context) => {
    const { request, log, session } = context;

    log.info(`Processing ${request.url}`);

    try {
        // Determine the type of page and scrape accordingly
        if (request.url.includes('/p/') || request.url.includes('/reel/')) {
            // This is a post/reel page
            await scrapePost(request.url, log, session);
        } else if (request.url.includes('/explore/tags/')) {
            // This is a hashtag page
            await scrapeHashtag(request.url, log, session);
        } else if (request.url.includes('/explore/locations/')) {
            // This is a location/place page
            await scrapeLocation(request.url, log, session);
        } else if (request.url.includes('instagram.com/') && !request.url.includes('/explore/')) {
            // This is a profile page
            await scrapeProfile(request.url, log, session);
        }
    } catch (error) {
        log.warning(`Error processing ${request.url}: ${error.message}`);
    }
});

/**
 * Scrape Instagram profile data
 */
async function scrapeProfile(url, log, session) {
    try {
        const username = extractUsernameFromUrl(url);
        if (!username) {
            log.warning(`Could not extract username from ${url}`);
            return;
        }

        // Fetch profile data
        const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch profile ${username}: ${response.status}`);
            return;
        }

        const data = await response.json();
        const user = data.data?.user;

        if (user) {
            const profileData = {
                url: url,
                type: 'profile',
                username: user.username,
                name: user.full_name,
                bio: user.biography,
                followers: user.follower_count,
                following: user.following_count,
                posts: user.media_count,
                isVerified: user.is_verified,
                profilePicUrl: user.profile_pic_url_hd,
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(profileData);
            log.info(`Scraped profile: ${username}`);

            // If requested, scrape posts from profile
            if (resultsType === 'posts' || resultsType === 'reels') {
                await scrapeProfilePosts(username, log, session);
            }
        }
    } catch (error) {
        log.warning(`Failed to scrape profile ${url}: ${error.message}`);
    }
}

/**
 * Scrape posts from a profile
 */
async function scrapeProfilePosts(username, log, session) {
    try {
        const response = await fetch(`https://www.instagram.com/api/v1/feed/user/${username}/username/?count=${resultsLimit}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch posts for ${username}: ${response.status}`);
            return;
        }

        const data = await response.json();
        const items = data.items || [];

        for (const item of items.slice(0, resultsLimit)) {
            const postData = {
                url: `https://www.instagram.com/p/${item.code}/`,
                type: 'post',
                username: username,
                caption: item.caption?.text || '',
                likes: item.like_count,
                comments: item.comment_count,
                timestamp: item.taken_at,
                mediaType: item.media_type === 8 ? 'carousel' : item.media_type === 2 ? 'video' : 'image',
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(postData);
        }

        log.info(`Scraped ${items.length} posts from ${username}`);
    } catch (error) {
        log.warning(`Failed to scrape posts from ${username}: ${error.message}`);
    }
}

/**
 * Scrape Instagram post data
 */
async function scrapePost(url, log, session) {
    try {
        const shortcode = extractShortcodeFromUrl(url);
        if (!shortcode) {
            log.warning(`Could not extract shortcode from ${url}`);
            return;
        }

        // Fetch post data
        const response = await fetch(`https://www.instagram.com/api/v1/media/${shortcode}/info/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch post ${shortcode}: ${response.status}`);
            return;
        }

        const data = await response.json();
        const item = data.items?.[0];

        if (item) {
            const postData = {
                url: url,
                type: 'post',
                username: item.user.username,
                caption: item.caption?.text || '',
                likes: item.like_count,
                comments: item.comment_count,
                timestamp: item.taken_at,
                mediaType: item.media_type === 8 ? 'carousel' : item.media_type === 2 ? 'video' : 'image',
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(postData);
            log.info(`Scraped post: ${shortcode}`);

            // If requested, scrape comments
            if (resultsType === 'comments') {
                await scrapeComments(shortcode, log, session);
            }
        }
    } catch (error) {
        log.warning(`Failed to scrape post ${url}: ${error.message}`);
    }
}

/**
 * Scrape comments from a post
 */
async function scrapeComments(shortcode, log, session) {
    try {
        const response = await fetch(
            `https://www.instagram.com/api/v1/media/${shortcode}/comments/?count=${resultsLimit}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
                },
            }
        );

        if (!response.ok) {
            log.warning(`Failed to fetch comments for ${shortcode}: ${response.status}`);
            return;
        }

        const data = await response.json();
        const comments = data.comments || [];

        for (const comment of comments.slice(0, resultsLimit)) {
            const commentData = {
                type: 'comment',
                postShortcode: shortcode,
                username: comment.user.username,
                text: comment.text,
                likes: comment.like_count,
                timestamp: comment.created_at,
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(commentData);
        }

        log.info(`Scraped ${comments.length} comments from ${shortcode}`);
    } catch (error) {
        log.warning(`Failed to scrape comments from ${shortcode}: ${error.message}`);
    }
}

/**
 * Scrape hashtag page
 */
async function scrapeHashtag(url, log, session) {
    try {
        const hashtag = url.split('/').filter(Boolean).pop();
        if (!hashtag) {
            log.warning(`Could not extract hashtag from ${url}`);
            return;
        }

        // Fetch hashtag data
        const response = await fetch(`https://www.instagram.com/api/v1/ig_hashtag_search/?user_id=0&strings=${hashtag}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch hashtag ${hashtag}: ${response.status}`);
            return;
        }

        const data = await response.json();
        const hashtagData = {
            url: url,
            type: 'hashtag',
            name: hashtag,
            scrapedAt: new Date().toISOString(),
        };

        await Actor.pushData(hashtagData);
        log.info(`Scraped hashtag: #${hashtag}`);
    } catch (error) {
        log.warning(`Failed to scrape hashtag ${url}: ${error.message}`);
    }
}

/**
 * Scrape location/place page
 */
async function scrapeLocation(url, log, session) {
    try {
        const locationId = url.split('/').filter(Boolean).pop();
        if (!locationId) {
            log.warning(`Could not extract location ID from ${url}`);
            return;
        }

        // Fetch location data
        const response = await fetch(`https://www.instagram.com/api/v1/locations/${locationId}/info/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-CSRFToken': session?.getCookie('csrftoken')?.value || '',
            },
        });

        if (!response.ok) {
            log.warning(`Failed to fetch location ${locationId}: ${response.status}`);
            return;
        }

        const data = await response.json();
        const location = data.location;

        if (location) {
            const locationData = {
                url: url,
                type: 'location',
                name: location.name,
                city: location.city,
                latitude: location.lat,
                longitude: location.lng,
                scrapedAt: new Date().toISOString(),
            };

            await Actor.pushData(locationData);
            log.info(`Scraped location: ${location.name}`);
        }
    } catch (error) {
        log.warning(`Failed to scrape location ${url}: ${error.message}`);
    }
}

// Add direct URLs to the crawler queue
if (input.directUrls && input.directUrls.length > 0) {
    await crawler.addRequests(
        input.directUrls.map((url) => ({
            url: url.includes('instagram.com') ? url : `https://www.instagram.com/${url}`,
            uniqueKey: url,
        })),
    );
}

// Handle search functionality
if (input.search) {
    const searchUrl = `https://www.instagram.com/api/v1/web/search/topsearch/?query=${encodeURIComponent(input.search)}&count=${searchLimit}`;
    await crawler.addRequests([{ url: searchUrl }]);
}

// Run the crawler
await crawler.run();

// Exit the actor
await Actor.exit();
