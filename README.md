# Instagram Scraper Actor

A powerful Apify Actor for scraping Instagram data including posts, profiles, hashtags, locations, comments, and more.

## Features

- **Scrape Instagram Posts**: Extract post captions, likes, comments count, and media information
- **Profile Scraping**: Get profile details including follower count, following count, bio, and post count
- **Hashtag Scraping**: Search and scrape hashtags along with associated posts
- **Location Scraping**: Extract data from Instagram locations/places
- **Comment Scraping**: Retrieve comments from Instagram posts
- **Search Functionality**: Search for users, hashtags, and places
- **Flexible Output**: Export data in JSON format for easy integration with other tools

## Input Parameters

The actor accepts the following input parameters:

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `directUrls` | Array | Instagram URLs to scrape (posts, profiles, hashtags, locations) | - |
| `resultsType` | String | Type of data to extract: `posts`, `comments`, `details`, `mentions`, `reels`, `stories` | `posts` |
| `resultsLimit` | Integer | Maximum number of results per URL (max 50 for comments) | `10` |
| `onlyPostsNewerThan` | String | Filter posts by date (YYYY-MM-DD or relative format like "1 days") | - |
| `isUserTaggedFeedURL` | Boolean | Get tagged posts for profiles | `false` |
| `isUserReelFeedURL` | Boolean | Get reels for profiles | `false` |
| `search` | String | Search query for profiles, hashtags, or places | - |
| `searchType` | String | Type of search: `user`, `hashtag`, `place` | `hashtag` |
| `searchLimit` | Integer | Number of search results to return (1-250) | `10` |
| `enhanceUserSearchWithFacebookPage` | Boolean | Enhance user search with Facebook page data | `false` |
| `addParentData` | Boolean | Add metadata about data source | `false` |

## Usage Examples

### Example 1: Scrape a Profile

```json
{
  "directUrls": ["https://www.instagram.com/instagram/"],
  "resultsType": "posts",
  "resultsLimit": 20
}
```

### Example 2: Search Hashtags

```json
{
  "search": "photography",
  "searchType": "hashtag",
  "searchLimit": 10,
  "resultsType": "posts",
  "resultsLimit": 5
}
```

### Example 3: Scrape Post Comments

```json
{
  "directUrls": ["https://www.instagram.com/p/ABC123/"],
  "resultsType": "comments",
  "resultsLimit": 50
}
```

### Example 4: Search Locations

```json
{
  "search": "New York",
  "searchType": "place",
  "searchLimit": 5,
  "resultsType": "posts",
  "resultsLimit": 10
}
```

## Output Format

The actor outputs data as JSON items in the dataset. Here are examples of different output types:

### Post Data

```json
{
  "url": "https://www.instagram.com/p/ABC123/",
  "type": "post",
  "caption": "Beautiful sunset",
  "likes": "1,234",
  "comments": "56",
  "scrapedAt": "2024-01-15T10:30:00.000Z"
}
```

### Profile Data

```json
{
  "url": "https://www.instagram.com/instagram/",
  "type": "profile",
  "username": "instagram",
  "bio": "Bringing you closer to the people and things you love.",
  "followers": "6.5M",
  "following": "123",
  "posts": "4,567",
  "scrapedAt": "2024-01-15T10:30:00.000Z"
}
```

### Comment Data

```json
{
  "type": "comment",
  "postUrl": "https://www.instagram.com/p/ABC123/",
  "text": "Amazing photo!",
  "author": "john_doe",
  "scrapedAt": "2024-01-15T10:30:00.000Z"
}
```

### Hashtag Data

```json
{
  "url": "https://www.instagram.com/explore/tags/photography/",
  "type": "hashtag",
  "hashtag": "#photography",
  "visiblePosts": 1234,
  "scrapedAt": "2024-01-15T10:30:00.000Z"
}
```

## Installation & Deployment

### Local Development

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the actor locally:
   ```bash
   npm start
   ```

### Deploy to Apify

1. Install Apify CLI:
   ```bash
   npm install -g apify-cli
   ```

2. Authenticate with Apify:
   ```bash
   apify auth
   ```

3. Push the actor to Apify:
   ```bash
   apify push
   ```

4. Publish to Apify Store:
   - Go to Apify Console
   - Navigate to your actor
   - Go to Publication > Display information
   - Fill in all required fields (icon, description, README, categories)
   - Click "Publish to Store"

## Important Notes

### Legal & Ethical Considerations

- This scraper only extracts publicly available data
- Always respect Instagram's Terms of Service
- Do not scrape private user data (email, phone, etc.)
- Be aware of GDPR and other data protection regulations
- Use scraped data responsibly and ethically

### Technical Limitations

- Instagram has strong anti-scraping measures
- Frequent scraping may result in IP blocks or account restrictions
- Use proxies and implement delays to avoid detection
- Dynamic content loading may require additional scrolling logic
- Instagram's DOM structure changes frequently, requiring selector updates

### Performance Considerations

- Scraping speed depends on Instagram's server response time
- Implement reasonable delays between requests
- Use pagination to handle large result sets
- Monitor API usage and costs

## Monetization

This actor uses a **Pay-Per-Result** pricing model:
- Price: $0.0023 per result (subject to change)
- Apify takes a 20% commission
- Platform costs are deducted from earnings
- Monthly payouts on the 11th of each month

## Troubleshooting

### Common Issues

**Issue**: Actor times out
- **Solution**: Reduce `resultsLimit` or `searchLimit` values

**Issue**: No data returned
- **Solution**: Verify Instagram URLs are correct and publicly accessible

**Issue**: Selectors not working
- **Solution**: Instagram's DOM structure changes frequently; update CSS selectors in the code

**Issue**: IP blocked
- **Solution**: Use Apify's proxy integration or implement delays between requests

## Support & Feedback

For issues, feature requests, or feedback:
- Check the [Issues](https://apify.com/apify/instagram-scraper/issues) tab
- Review the [Changelog](https://apify.com/apify/instagram-scraper/changelog) for updates
- Contact Apify support for technical assistance

## License

MIT License - feel free to use and modify this actor

## Disclaimer

This actor is provided as-is for educational and research purposes. Users are responsible for ensuring their use complies with Instagram's Terms of Service and applicable laws. The developer assumes no liability for misuse.
