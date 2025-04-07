import { TwitterApi } from 'twitter-api-v2';
import { Platform, PlatformAnalysis, Personality } from '../types.js';

export class TwitterService {
  private client: TwitterApi | null = null;
  
  constructor(token?: string) {
    if (token) {
      this.client = new TwitterApi(token);
    }
  }

  /**
   * TwitterのURLからユーザー名を抽出
   */
  private extractUsername(url: string): string {
    // twitter.com/username または x.com/username の形式を想定
    const match = url.match(/(?:twitter|x)\.com\/([^\/\?]+)/);
    if (!match) {
      throw new Error('Invalid Twitter/X URL');
    }
    return match[1];
  }

  /**
   * Twitterユーザーの情報を取得して分析
   */
  public async analyze(url: string): Promise<PlatformAnalysis> {
    const username = this.extractUsername(url);
    
    try {
      let userData: any = null;
      let tweets: any[] = [];
      
      // APIクライアントが利用可能な場合はAPIを使用
      if (this.client) {
        // ユーザー情報の取得
        userData = await this.client.v2.userByUsername(username, {
          'user.fields': ['description', 'public_metrics', 'created_at', 'location', 'url'],
        });
        
        // 最新のツイートを取得
        const userTweets = await this.client.v2.userTimeline(userData.data.id, {
          max_results: 100,
          'tweet.fields': ['created_at', 'public_metrics', 'entities'],
        });
        
        tweets = userTweets.data.data || [];
      } else {
        // APIが利用できない場合はスクレイピングを検討
        // 注意: Twitterのスクレイピングは利用規約に違反する可能性があります
        console.warn('Twitter API token not provided. Skipping detailed analysis.');
      }
      
      // ツイートからトピックを抽出
      const topics = this.extractTopicsFromTweets(tweets);
      
      // ハッシュタグの分析
      const hashtags = this.extractHashtags(tweets);
      
      // 人となりの分析
      const personality: Partial<Personality> = {
        interests: Array.from(hashtags).slice(0, 10),
        activities: userData?.data?.description ? [userData.data.description] : [],
        communication: {
          style: this.analyzeCommStyle(userData, tweets),
          frequency: this.calculateTweetFrequency(tweets),
          topics: Array.from(topics).slice(0, 5),
        },
      };

      return {
        platform: Platform.TWITTER,
        url,
        techStack: {
          // Twitterからは技術スタックの詳細情報は取得しにくいため、
          // 主にハッシュタグやツイート内容から推測する
          topics: Array.from(topics),
        },
        personality,
        rawData: { user: userData?.data, tweets },
      };
    } catch (error) {
      console.error('Twitter API error:', error);
      throw new Error(`Twitter分析中にエラーが発生しました: ${error}`);
    }
  }

  /**
   * ツイートからトピックを抽出
   */
  private extractTopicsFromTweets(tweets: any[]): Set<string> {
    const topics = new Set<string>();
    
    // 技術関連のキーワードリスト
    const techKeywords = [
      'javascript', 'typescript', 'python', 'java', 'ruby', 'go', 'rust', 'c#', 'php',
      'react', 'vue', 'angular', 'svelte', 'node', 'deno', 'rails', 'django', 'laravel',
      'aws', 'azure', 'gcp', 'cloud', 'docker', 'kubernetes', 'devops', 'cicd',
      'ai', 'ml', 'machinelearning', 'deeplearning', 'data', 'analytics',
      'web', 'mobile', 'frontend', 'backend', 'fullstack', 'database', 'sql', 'nosql',
      'security', 'blockchain', 'crypto', 'iot', 'ar', 'vr',
    ];
    
    for (const tweet of tweets) {
      if (!tweet.text) continue;
      
      const text = tweet.text.toLowerCase();
      
      // 技術キーワードの検出
      for (const keyword of techKeywords) {
        if (text.includes(keyword)) {
          topics.add(keyword);
        }
      }
      
      // エンティティからトピックを抽出
      if (tweet.entities) {
        // ハッシュタグ
        if (tweet.entities.hashtags) {
          for (const tag of tweet.entities.hashtags) {
            const hashtag = tag.tag.toLowerCase();
            if (techKeywords.some(kw => hashtag.includes(kw))) {
              topics.add(hashtag);
            }
          }
        }
        
        // メンション
        if (tweet.entities.mentions) {
          for (const mention of tweet.entities.mentions) {
            // 有名な技術アカウントへのメンションを検出
            const techAccounts = ['github', 'stackoverflow', 'nodejs', 'reactjs'];
            if (techAccounts.some(acc => mention.username.toLowerCase().includes(acc))) {
              topics.add(mention.username.toLowerCase());
            }
          }
        }
      }
    }
    
    return topics;
  }

  /**
   * ツイートからハッシュタグを抽出
   */
  private extractHashtags(tweets: any[]): Set<string> {
    const hashtags = new Set<string>();
    
    for (const tweet of tweets) {
      if (tweet.entities && tweet.entities.hashtags) {
        for (const tag of tweet.entities.hashtags) {
          hashtags.add(tag.tag.toLowerCase());
        }
      }
    }
    
    return hashtags;
  }

  /**
   * コミュニケーションスタイルの分析
   */
  private analyzeCommStyle(userData: any, tweets: any[]): string {
    if (!userData || !tweets.length) {
      return '情報不足のため分析できません';
    }
    
    // フォロワー数
    const followers = userData.data.public_metrics?.followers_count || 0;
    
    // リツイート率
    const retweetCount = tweets.filter(t => t.text?.startsWith('RT @')).length;
    const retweetRatio = tweets.length > 0 ? retweetCount / tweets.length : 0;
    
    // リプライ率
    const replyCount = tweets.filter(t => t.referenced_tweets?.some((rt: any) => rt.type === 'replied_to')).length;
    const replyRatio = tweets.length > 0 ? replyCount / tweets.length : 0;
    
    // 平均文字数
    const avgLength = tweets.reduce((sum, t) => sum + (t.text?.length || 0), 0) / (tweets.length || 1);
    
    // スタイル分析
    if (followers > 5000) {
      return '影響力のある発信者';
    } else if (retweetRatio > 0.7) {
      return '情報共有型';
    } else if (replyRatio > 0.5) {
      return '対話重視型';
    } else if (avgLength > 200) {
      return '詳細な説明を好むスタイル';
    } else if (avgLength < 100) {
      return '簡潔な発信を好むスタイル';
    }
    
    return 'バランスの取れたコミュニケーションスタイル';
  }

  /**
   * ツイート頻度の計算（1日あたりの平均ツイート数）
   */
  private calculateTweetFrequency(tweets: any[]): number {
    if (!tweets.length) return 0;
    
    // 最新と最古のツイートの日付を取得
    const dates = tweets
      .map(t => t.created_at ? new Date(t.created_at) : null)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length < 2) return tweets.length; // 日数計算できない場合は単純にツイート数を返す
    
    const oldestDate = dates[0];
    const newestDate = dates[dates.length - 1];
    const daysDiff = (newestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysDiff > 0 ? tweets.length / daysDiff : tweets.length;
  }
}
