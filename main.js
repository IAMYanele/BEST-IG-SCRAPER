import { Actor } from 'apify';
import { PlaywrightCrawler, Configuration } from 'crawlee';

// Initialize the Actor
await Actor.init();

// Get the input from the actor's input schema
const input = await Actor.getInput();

// Validate input
if (!input.directUrls && !input.search) {
    throw new Error('You need to provide either directUrls or search query');
}

// Configuration for the crawler
const crawlerConfig = new Configuration({
    persistStateKeyValueStoreId: 'default',
});

// Create the crawler
const crawler = new PlaywrightCrawler(
    {
        useSessionPool: true,
        persistCookiesPerSession: true,
        maxRequestsPerCrawl: input.searchLimit || 100,
        maxRequestRetries: 3,
        headless: true,
    },
    crawlerConfig,
);

// Handle page routing
crawler.router.addDefaultHandler(async (context) => {
    const { page, request, log } = context;

    log.info(`Processing ${request.url}`);

    // Determine the type of page and scrape accordingly
    if (request.url.includes('/p/') || request.url.includes('/reel/')) {
        // This is a post/reel page
        await scrapePost(page, request.url, log);
    } else if (request.url.includes('/explore/tags/')) {
        // This is a hashtag page
        await scrapeHashtag(page, request.url, log);
    } else if (request.url.includes('/explore/locations/')) {
        // This is a location/place page
        await scrapeLocation(page, request.url, log);
    } else if (request.url.includes('instagram.com/') && !request.url.includes('/explore/')) {
        // This is a profile page
        await scrapeProfile(page, request.url, log);
    }
});

/**
 * Scrape Instagram post data
 */
async function scrapePost(page, url, log) {
    try {
        // Wait for the post content to load
        await page.waitForSelector('article', { timeout: 10000 });

        // Extract post data
        const postData = await page.evaluate(() => {
            const article = document.querySelector('article');
            if (!article) return null;

            const caption = article.querySelector('h1')?.innerText || '';
            const likesText = article.querySelector('[aria-label*="like"]')?.innerText || '0';
            const commentsCount = article.querySelector('[aria-label*="comment"]')?.innerText || '0';

            return {
                url: window.location.href,
                type: 'post',
                caption,
                likes: likesText,
                comments: commentsCount,
                scrapedAt: new Date().toISOString(),
            };
        });

        if (postData) {
            await Actor.pushData(postData);
            log.info(`Scraped post: ${postData.url}`);
        }

        // Scrape comments if requested
        if (input.resultsType === 'comments') {
            await scrapeComments(page, url, log);
        }
    } catch (error) {
        log.warning(`Failed to scrape post ${url}: ${error.message}`);
    }
}

/**
 * Scrape comments from a post
 */
async function scrapeComments(page, url, log) {
    try {
        // Click to load comments
        const commentsButton = await page.$('[aria-label*="comment"]');
        if (commentsButton) {
            await commentsButton.click();
            await page.waitForTimeout(1000);
        }

        // Scroll to load more comments
        let previousHeight = 0;
        let currentHeight = await page.evaluate(() => document.body.scrollHeight);

        while (previousHeight !== currentHeight && (input.resultsLimit || 10) > 0) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await page.waitForTimeout(500);
            previousHeight = currentHeight;
            currentHeight = await page.evaluate(() => document.body.scrollHeight);
        }

        // Extract comments
        const comments = await page.evaluate(() => {
            const commentElements = document.querySelectorAll('[data-testid="comment"]');
            return Array.from(commentElements).slice(0, 50).map((el) => ({
                text: el.innerText,
                author: el.querySelector('a')?.innerText || 'Unknown',
            }));
        });

        for (const comment of comments) {
            await Actor.pushData({
                type: 'comment',
                postUrl: url,
                ...comment,
                scrapedAt: new Date().toISOString(),
            });
        }

        log.info(`Scraped ${comments.length} comments from ${url}`);
    } catch (error) {
        log.warning(`Failed to scrape comments from ${url}: ${error.message}`);
    }
}

/**
 * Scrape hashtag page
 */
async function scrapeHashtag(page, url, log) {
    try {
        await page.waitForSelector('[role="grid"]', { timeout: 10000 });

        const hashtagData = await page.evaluate(() => {
            const hashtag = window.location.pathname.split('/')[2];
            const postsGrid = document.querySelector('[role="grid"]');
            const postCount = postsGrid?.querySelectorAll('a[href*="/p/"]').length || 0;

            return {
                url: window.location.href,
                type: 'hashtag',
                hashtag: `#${hashtag}`,
                visiblePosts: postCount,
                scrapedAt: new Date().toISOString(),
            };
        });

        await Actor.pushData(hashtagData);
        log.info(`Scraped hashtag: ${hashtagData.hashtag}`);

        // Scrape individual posts from hashtag if requested
        if (input.resultsType === 'posts') {
            await scrapePostsFromGrid(page, url, log);
        }
    } catch (error) {
        log.warning(`Failed to scrape hashtag ${url}: ${error.message}`);
    }
}

/**
 * Scrape location/place page
 */
async function scrapeLocation(page, url, log) {
    try {
        await page.waitForSelector('[role="grid"]', { timeout: 10000 });

        const locationData = await page.evaluate(() => {
            const locationName = document.querySelector('h1')?.innerText || 'Unknown';
            const postsGrid = document.querySelector('[role="grid"]');
            const postCount = postsGrid?.querySelectorAll('a[href*="/p/"]').length || 0;

            return {
                url: window.location.href,
                type: 'location',
                name: locationName,
                visiblePosts: postCount,
                scrapedAt: new Date().toISOString(),
            };
        });

        await Actor.pushData(locationData);
        log.info(`Scraped location: ${locationData.name}`);

        // Scrape individual posts from location if requested
        if (input.resultsType === 'posts') {
            await scrapePostsFromGrid(page, url, log);
        }
    } catch (error) {
        log.warning(`Failed to scrape location ${url}: ${error.message}`);
    }
}

/**
 * Scrape profile page
 */
async function scrapeProfile(page, url, log) {
    try {
        // Wait for profile header to load
        await page.waitForSelector('header', { timeout: 10000 });

        const profileData = await page.evaluate(() => {
            const username = window.location.pathname.slice(1, -1);
            const bioElement = document.querySelector('[data-testid="bio"]');
            const bio = bioElement?.innerText || '';
            const followersText = document.querySelector('[title*="followers"]')?.innerText || '0';
            const followingText = document.querySelector('[title*="following"]')?.innerText || '0';
            const postsText = document.querySelector('[data-testid="posts"]')?.innerText || '0';

            return {
                url: window.location.href,
                type: 'profile',
                username,
                bio,
                followers: followersText,
                following: followingText,
                posts: postsText,
                scrapedAt: new Date().toISOString(),
            };
        });

        await Actor.pushData(profileData);
        log.info(`Scraped profile: ${profileData.username}`);

        // Scrape posts from profile if requested
        if (input.resultsType === 'posts') {
            await scrapePostsFromGrid(page, url, log);
        }
    } catch (error) {
        log.warning(`Failed to scrape profile ${url}: ${error.message}`);
    }
}

/**
 * Scrape posts from a grid (profile, hashtag, or location)
 */
async function scrapePostsFromGrid(page, url, log) {
    try {
        // Scroll to load more posts
        let postsLoaded = 0;
        const maxResults = input.resultsLimit || 10;

        while (postsLoaded < maxResults) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await page.waitForTimeout(500);

            const posts = await page.evaluate(() => {
                const postLinks = document.querySelectorAll('a[href*="/p/"]');
                return Array.from(postLinks).map((link) => link.href);
            });

            postsLoaded = posts.length;
        }

        log.info(`Found ${postsLoaded} posts on ${url}`);
    } catch (error) {
        log.warning(`Failed to scrape posts from grid ${url}: ${error.message}`);
    }
}

// Handle search functionality
if (input.search) {
    const searchUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(input.search)}`;
    await crawler.addRequests([{ url: searchUrl }]);
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

// Run the crawler
await crawler.run();

// Exit the actor
await Actor.exit();
