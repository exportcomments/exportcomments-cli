// ── Supported Platforms Metadata ──
// Comprehensive platform definitions for AI consumption

import type { PlatformInfo } from './types.js';

export const PLATFORMS: PlatformInfo[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    url_patterns: [
      'instagram.com/p/<post_id>',
      'instagram.com/reel/<reel_id>',
      'instagram.com/<username>',
    ],
    supported_options: ['replies', 'limit', 'cookies', 'vpn'],
    description: 'Export comments from Instagram posts, reels, and profile posts',
    example_urls: [
      'https://www.instagram.com/p/ABC123/',
      'https://www.instagram.com/reel/ABC123/',
      'https://www.instagram.com/username/',
    ],
    export_types: ['comments', 'posts'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url_patterns: [
      'youtube.com/watch?v=<video_id>',
      'youtu.be/<video_id>',
      'youtube.com/shorts/<short_id>',
      'music.youtube.com/watch?v=<video_id>',
    ],
    supported_options: ['replies', 'limit', 'vpn'],
    description: 'Export comments from YouTube videos, shorts, and YouTube Music',
    example_urls: [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/ABC123',
    ],
    export_types: ['comments'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    url_patterns: [
      'tiktok.com/@<username>/video/<video_id>',
      'tiktok.com/<username>',
    ],
    supported_options: ['replies', 'limit', 'vpn', 'cookies'],
    description: 'Export comments from TikTok videos and profile posts',
    example_urls: [
      'https://www.tiktok.com/@username/video/1234567890',
      'https://www.tiktok.com/@username',
    ],
    export_types: ['comments', 'posts'],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    url_patterns: [
      'facebook.com/<page>/posts/<post_id>',
      'facebook.com/<user_id>/posts/<post_id>',
      'facebook.com/groups/<group_id>',
      'facebook.com/<page>/reviews',
    ],
    supported_options: ['replies', 'limit', 'cookies', 'vpn', 'facebookAds'],
    description: 'Export comments from Facebook posts, pages, groups, and reviews',
    example_urls: [
      'https://www.facebook.com/page/posts/123456789',
      'https://www.facebook.com/page/reviews',
    ],
    export_types: ['comments', 'reviews', 'posts'],
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    url_patterns: [
      'twitter.com/<username>/status/<tweet_id>',
      'x.com/<username>/status/<tweet_id>',
      'twitter.com/<username>',
      'x.com/<username>',
    ],
    supported_options: ['replies', 'limit', 'tweets', 'likes', 'followers', 'following', 'cookies', 'vpn'],
    description: 'Export replies to tweets, user timelines, likes, followers, and following lists',
    example_urls: [
      'https://twitter.com/username/status/1234567890',
      'https://x.com/username/status/1234567890',
      'https://x.com/username',
    ],
    export_types: ['comments', 'tweets', 'followers', 'following', 'likes'],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url_patterns: [
      'linkedin.com/posts/<post_id>',
      'linkedin.com/feed/update/<activity_id>',
    ],
    supported_options: ['replies', 'limit', 'cookies', 'vpn'],
    description: 'Export comments from LinkedIn posts and articles',
    example_urls: [
      'https://www.linkedin.com/posts/username-activity-123456789',
      'https://www.linkedin.com/feed/update/urn:li:activity:123456789',
    ],
    export_types: ['comments'],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    url_patterns: [
      'reddit.com/r/<subreddit>/comments/<post_id>',
      'reddit.com/r/<subreddit>',
    ],
    supported_options: ['replies', 'limit', 'vpn'],
    description: 'Export comments from Reddit posts and subreddit threads',
    example_urls: [
      'https://www.reddit.com/r/subreddit/comments/abc123/title/',
      'https://www.reddit.com/r/subreddit/',
    ],
    export_types: ['comments', 'posts'],
  },
  {
    id: 'threads',
    name: 'Threads',
    url_patterns: [
      'threads.net/@<username>/post/<post_id>',
    ],
    supported_options: ['replies', 'limit', 'vpn'],
    description: 'Export comments from Threads posts',
    example_urls: [
      'https://www.threads.net/@username/post/ABC123',
    ],
    export_types: ['comments'],
  },
  {
    id: 'trustpilot',
    name: 'Trustpilot',
    url_patterns: [
      'trustpilot.com/review/<domain>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from Trustpilot business pages',
    example_urls: [
      'https://www.trustpilot.com/review/example.com',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'yelp',
    name: 'Yelp',
    url_patterns: [
      'yelp.com/biz/<business_slug>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from Yelp business pages',
    example_urls: [
      'https://www.yelp.com/biz/business-name-city',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    url_patterns: [
      'amazon.com/dp/<asin>',
      'amazon.com/product-reviews/<asin>',
      'amazon.<tld>/dp/<asin>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from Amazon (all regional domains)',
    example_urls: [
      'https://www.amazon.com/dp/B08N5WRWNW',
      'https://www.amazon.com/product-reviews/B08N5WRWNW',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'google_reviews',
    name: 'Google Reviews',
    url_patterns: [
      'google.com/maps/place/<place>',
      'maps.google.com/?cid=<id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export Google Maps/Business reviews',
    example_urls: [
      'https://www.google.com/maps/place/Business+Name/',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'tripadvisor',
    name: 'TripAdvisor',
    url_patterns: [
      'tripadvisor.com/<type>/<name>-Reviews-<id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from TripAdvisor listings',
    example_urls: [
      'https://www.tripadvisor.com/Restaurant_Review-g123-d456-Reviews-Name.html',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'appstore',
    name: 'Apple App Store',
    url_patterns: [
      'apps.apple.com/<country>/app/<name>/id<app_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export app reviews from the Apple App Store',
    example_urls: [
      'https://apps.apple.com/us/app/example/id123456789',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'playstore',
    name: 'Google Play Store',
    url_patterns: [
      'play.google.com/store/apps/details?id=<package>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export app reviews from the Google Play Store',
    example_urls: [
      'https://play.google.com/store/apps/details?id=com.example.app',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'twitch',
    name: 'Twitch',
    url_patterns: [
      'twitch.tv/videos/<video_id>',
      'twitch.tv/<username>/clip/<clip_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export chat messages and comments from Twitch VODs and clips',
    example_urls: [
      'https://www.twitch.tv/videos/1234567890',
    ],
    export_types: ['comments', 'chat'],
  },
  {
    id: 'discord',
    name: 'Discord',
    url_patterns: [
      'discord.com/channels/<server_id>/<channel_id>',
    ],
    supported_options: ['limit', 'cookies'],
    description: 'Export messages from Discord channels (requires authentication cookies)',
    example_urls: [
      'https://discord.com/channels/123456789/987654321',
    ],
    export_types: ['messages'],
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    url_patterns: [
      'vimeo.com/<video_id>',
    ],
    supported_options: ['replies', 'limit', 'vpn'],
    description: 'Export comments from Vimeo videos',
    example_urls: [
      'https://vimeo.com/123456789',
    ],
    export_types: ['comments'],
  },
  {
    id: 'imdb',
    name: 'IMDb',
    url_patterns: [
      'imdb.com/title/<title_id>/reviews',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export user reviews from IMDb movie/show pages',
    example_urls: [
      'https://www.imdb.com/title/tt1234567/reviews',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'aliexpress',
    name: 'AliExpress',
    url_patterns: [
      'aliexpress.com/item/<item_id>.html',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from AliExpress',
    example_urls: [
      'https://www.aliexpress.com/item/1234567890.html',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'shopee',
    name: 'Shopee',
    url_patterns: [
      'shopee.<tld>/<slug>-i.<shop_id>.<item_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from Shopee (multiple regional domains)',
    example_urls: [
      'https://shopee.sg/product-i.123.456',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'etsy',
    name: 'Etsy',
    url_patterns: [
      'etsy.com/listing/<listing_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from Etsy product listings',
    example_urls: [
      'https://www.etsy.com/listing/1234567890/',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'walmart',
    name: 'Walmart',
    url_patterns: [
      'walmart.com/ip/<product_id>',
      'walmart.com/reviews/product/<product_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from Walmart',
    example_urls: [
      'https://www.walmart.com/ip/123456789',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'bestbuy',
    name: 'Best Buy',
    url_patterns: [
      'bestbuy.com/site/<product>/<sku_id>.p',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from Best Buy',
    example_urls: [
      'https://www.bestbuy.com/site/product/1234567.p',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'ebay',
    name: 'eBay',
    url_patterns: [
      'ebay.com/itm/<item_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from eBay listings',
    example_urls: [
      'https://www.ebay.com/itm/123456789',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'flipkart',
    name: 'Flipkart',
    url_patterns: [
      'flipkart.com/<product>/<item_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from Flipkart',
    example_urls: [
      'https://www.flipkart.com/product/p/itm123',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    url_patterns: [
      'producthunt.com/posts/<product_slug>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export comments from Product Hunt product pages',
    example_urls: [
      'https://www.producthunt.com/posts/product-name',
    ],
    export_types: ['comments'],
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    url_patterns: [
      'airbnb.com/rooms/<listing_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from Airbnb listings',
    example_urls: [
      'https://www.airbnb.com/rooms/123456',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'steam',
    name: 'Steam',
    url_patterns: [
      'store.steampowered.com/app/<app_id>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export reviews from Steam game pages',
    example_urls: [
      'https://store.steampowered.com/app/570/DotA_2/',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'disqus',
    name: 'Disqus',
    url_patterns: [
      'Any URL with Disqus comments embedded',
    ],
    supported_options: ['replies', 'limit', 'vpn'],
    description: 'Export Disqus comments from any website using Disqus',
    example_urls: [
      'https://example.com/article-with-disqus-comments',
    ],
    export_types: ['comments'],
  },
  {
    id: 'vk',
    name: 'VKontakte (VK)',
    url_patterns: [
      'vk.com/wall<owner_id>_<post_id>',
      'vk.com/<community>?w=wall-<id>_<post_id>',
    ],
    supported_options: ['replies', 'limit', 'vpn'],
    description: 'Export comments from VK posts',
    example_urls: [
      'https://vk.com/wall-123456_789',
    ],
    export_types: ['comments'],
  },
  {
    id: 'lazada',
    name: 'Lazada',
    url_patterns: [
      'lazada.<tld>/products/<slug>-<item_id>.html',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export product reviews from Lazada (multiple regional domains)',
    example_urls: [
      'https://www.lazada.sg/products/product-name-i123456.html',
    ],
    export_types: ['reviews'],
  },
  {
    id: 'change_org',
    name: 'Change.org',
    url_patterns: [
      'change.org/p/<petition_slug>',
    ],
    supported_options: ['limit', 'vpn'],
    description: 'Export comments from Change.org petitions',
    example_urls: [
      'https://www.change.org/p/petition-title',
    ],
    export_types: ['comments'],
  },
];

/** Find a platform by matching a URL */
export function detectPlatform(url: string): PlatformInfo | null {
  const lower = url.toLowerCase();

  for (const p of PLATFORMS) {
    if (lower.includes(p.id.replace('_', '.'))) return p;
    // Check common domain patterns
    const domainChecks: Record<string, string> = {
      instagram: 'instagram.com',
      youtube: 'youtube.com',
      tiktok: 'tiktok.com',
      facebook: 'facebook.com',
      twitter: 'twitter.com',
      linkedin: 'linkedin.com',
      reddit: 'reddit.com',
      threads: 'threads.net',
      trustpilot: 'trustpilot.com',
      yelp: 'yelp.com',
      amazon: 'amazon.',
      google_reviews: 'google.com/maps',
      tripadvisor: 'tripadvisor.com',
      appstore: 'apps.apple.com',
      playstore: 'play.google.com',
      twitch: 'twitch.tv',
      discord: 'discord.com',
      vimeo: 'vimeo.com',
      imdb: 'imdb.com',
      aliexpress: 'aliexpress.com',
      shopee: 'shopee.',
      etsy: 'etsy.com',
      walmart: 'walmart.com',
      bestbuy: 'bestbuy.com',
      ebay: 'ebay.com',
      flipkart: 'flipkart.com',
      producthunt: 'producthunt.com',
      airbnb: 'airbnb.com',
      steam: 'steampowered.com',
      vk: 'vk.com',
      lazada: 'lazada.',
      change_org: 'change.org',
    };

    if (domainChecks[p.id] && lower.includes(domainChecks[p.id])) {
      return p;
    }
  }

  // Also check x.com for Twitter
  if (lower.includes('x.com')) {
    return PLATFORMS.find((p) => p.id === 'twitter') ?? null;
  }
  // youtu.be short URLs
  if (lower.includes('youtu.be')) {
    return PLATFORMS.find((p) => p.id === 'youtube') ?? null;
  }
  // music.youtube.com
  if (lower.includes('music.youtube.com')) {
    return PLATFORMS.find((p) => p.id === 'youtube') ?? null;
  }

  return null;
}
