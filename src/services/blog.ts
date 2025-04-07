import axios from 'axios';
import * as cheerio from 'cheerio';
import { Platform, PlatformAnalysis, Personality } from '../types.js';

export class BlogService {
  /**
   * ブログのURLからドメインを抽出
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      throw new Error('Invalid Blog URL');
    }
  }

  /**
   * ブログの情報を取得して分析
   */
  public async analyze(url: string): Promise<PlatformAnalysis> {
    const domain = this.extractDomain(url);
    
    try {
      // ブログのHTMLを取得
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      // ブログのタイトルを取得
      const title = $('title').text().trim();
      
      // メタ情報を取得
      const description = $('meta[name="description"]').attr('content') || 
                          $('meta[property="og:description"]').attr('content') || '';
      
      // 記事一覧を取得（プラットフォームによって異なる）
      const articles: Array<{
        title: string;
        url: string;
        content: string;
        date?: string;
      }> = [];
      
      // 一般的な記事セレクタを試す
      const articleSelectors = [
        'article', '.post', '.entry', '.blog-post', '.blog-entry',
        '.post-content', '.entry-content', '.article-content'
      ];
      
      // 各セレクタを試して記事を抽出
      for (const selector of articleSelectors) {
        $(selector).each((_, element) => {
          const articleTitle = $(element).find('h1, h2, h3').first().text().trim();
          const articleUrl = $(element).find('a').attr('href') || '';
          const articleContent = $(element).text().trim();
          const articleDate = $(element).find('time').attr('datetime') || 
                             $(element).find('.date, .time, .published, .post-date').text().trim();
          
          if (articleTitle && articleContent) {
            articles.push({
              title: articleTitle,
              url: this.normalizeUrl(articleUrl, url),
              content: articleContent,
              date: articleDate
            });
          }
        });
        
        // 記事が見つかったら終了
        if (articles.length > 0) break;
      }
      
      // 記事が見つからない場合は、リンクとテキストから推測
      if (articles.length === 0) {
        $('a').each((_, element) => {
          const href = $(element).attr('href');
          const text = $(element).text().trim();
          
          // 記事らしきリンクを検出
          if (href && text && href.includes('/') && text.length > 20 && !href.startsWith('http')) {
            articles.push({
              title: text,
              url: this.normalizeUrl(href, url),
              content: text
            });
          }
        });
      }
      
      // ブログからトピックを抽出
      const topics = this.extractTopicsFromBlog($, articles);
      
      // 技術スタックの推測
      const techStack = this.inferTechStack($, articles, topics);
      
      // 人となりの分析
      const personality: Partial<Personality> = {
        interests: Array.from(topics).slice(0, 10),
        activities: [
          description,
          `${articles.length}件の記事を分析`,
        ].filter(Boolean),
        communication: {
          style: this.analyzeCommStyle($, articles),
          frequency: this.estimatePostFrequency(articles),
          topics: Array.from(topics).slice(0, 5),
        },
        workStyle: this.inferWorkStyle(articles),
      };

      return {
        platform: Platform.BLOG,
        url,
        techStack: {
          topics: Array.from(topics),
          ...techStack,
        },
        personality,
        rawData: { title, description, domain, articles },
      };
    } catch (error) {
      console.error('Blog scraping error:', error);
      throw new Error(`ブログ分析中にエラーが発生しました: ${error}`);
    }
  }

  /**
   * 相対URLを絶対URLに変換
   */
  private normalizeUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).toString();
    } catch (error) {
      return href;
    }
  }

  /**
   * ブログからトピックを抽出
   */
  private extractTopicsFromBlog($: cheerio.CheerioAPI, articles: Array<{ title: string; content: string }>): Set<string> {
    const topics = new Set<string>();
    
    // タグやカテゴリーを抽出
    const tagSelectors = [
      '.tags a', '.categories a', '.category a', '.tag a',
      'a[rel="tag"]', '.post-tags a', '.entry-tags a',
      '.post-categories a', '.entry-categories a'
    ];
    
    for (const selector of tagSelectors) {
      $(selector).each((_, element) => {
        const tag = $(element).text().trim().toLowerCase();
        if (tag && tag.length > 1) {
          topics.add(tag);
        }
      });
    }
    
    // 記事のタイトルと内容からトピックを抽出
    const techKeywords = [
      'javascript', 'typescript', 'python', 'java', 'ruby', 'go', 'rust', 'c#', 'php',
      'react', 'vue', 'angular', 'svelte', 'node', 'deno', 'rails', 'django', 'laravel',
      'aws', 'azure', 'gcp', 'cloud', 'docker', 'kubernetes', 'devops', 'cicd',
      'ai', 'ml', 'machine learning', 'deep learning', 'data', 'analytics',
      'web', 'mobile', 'frontend', 'backend', 'fullstack', 'database', 'sql', 'nosql',
      'security', 'blockchain', 'crypto', 'iot', 'ar', 'vr',
      'architecture', 'microservices', 'serverless', 'testing', 'agile', 'scrum',
      'design', 'ux', 'ui', 'accessibility', 'performance', 'optimization',
    ];
    
    for (const article of articles) {
      const text = (article.title + ' ' + article.content).toLowerCase();
      
      // 技術キーワードの検出
      for (const keyword of techKeywords) {
        if (text.includes(keyword)) {
          topics.add(keyword);
        }
      }
    }
    
    return topics;
  }

  /**
   * 技術スタックを推測
   */
  private inferTechStack(
    $: cheerio.CheerioAPI,
    articles: Array<{ title: string; content: string }>,
    topics: Set<string>
  ): { languages: Record<string, number>; frameworks: Record<string, number>; tools: Record<string, number> } {
    const languages: Record<string, number> = {};
    const frameworks: Record<string, number> = {};
    const tools: Record<string, number> = {};
    
    // 言語のリスト
    const languageList = [
      'javascript', 'typescript', 'python', 'java', 'ruby', 'go', 'rust', 'c#', 'php',
      'swift', 'kotlin', 'scala', 'haskell', 'clojure', 'elixir', 'erlang',
      'c', 'c++', 'objective-c', 'dart', 'lua', 'perl', 'r',
    ];
    
    // フレームワークのリスト
    const frameworkList = [
      'react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'gatsby',
      'express', 'koa', 'nest', 'fastify', 'hapi',
      'django', 'flask', 'fastapi', 'spring', 'rails', 'laravel',
      'tensorflow', 'pytorch', 'keras',
    ];
    
    // ツールのリスト
    const toolList = [
      'webpack', 'babel', 'eslint', 'prettier', 'jest', 'mocha', 'cypress',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'firebase',
      'graphql', 'apollo', 'redux', 'mobx', 'zustand',
      'git', 'github', 'gitlab', 'bitbucket',
    ];
    
    // コードブロックを検出
    const codeBlocks: string[] = [];
    $('pre, code').each((_, element) => {
      codeBlocks.push($(element).text().trim().toLowerCase());
    });
    
    // コードブロックから言語を推測
    for (const code of codeBlocks) {
      for (const lang of languageList) {
        if (
          code.includes(`function`) || 
          code.includes(`class`) || 
          code.includes(`import`) || 
          code.includes(`from`) ||
          code.includes(`def `) ||
          code.includes(`var `) ||
          code.includes(`const `) ||
          code.includes(`let `)
        ) {
          // 言語の特徴的なキーワードを検出
          if (
            (lang === 'javascript' && (code.includes('const ') || code.includes('let ') || code.includes('function'))) ||
            (lang === 'typescript' && (code.includes(':') && code.includes('interface'))) ||
            (lang === 'python' && (code.includes('def ') || code.includes('import '))) ||
            (lang === 'java' && (code.includes('public class') || code.includes('private '))) ||
            (lang === 'ruby' && (code.includes('def ') || code.includes('end'))) ||
            (lang === 'go' && (code.includes('func ') || code.includes('package ')))
          ) {
            languages[lang] = (languages[lang] || 0) + 1;
          }
        }
      }
    }
    
    // 記事のタイトルと内容から技術スタックを推測
    for (const article of articles) {
      const text = (article.title + ' ' + article.content).toLowerCase();
      
      // 言語の検出
      for (const lang of languageList) {
        if (text.includes(lang)) {
          languages[lang] = (languages[lang] || 0) + 1;
        }
      }
      
      // フレームワークの検出
      for (const fw of frameworkList) {
        if (text.includes(fw)) {
          frameworks[fw] = (frameworks[fw] || 0) + 1;
        }
      }
      
      // ツールの検出
      for (const tool of toolList) {
        if (text.includes(tool)) {
          tools[tool] = (tools[tool] || 0) + 1;
        }
      }
    }
    
    // トピックからも技術スタックを補完
    for (const topic of topics) {
      const topicLower = topic.toLowerCase();
      
      if (languageList.some(lang => topicLower.includes(lang))) {
        const lang = languageList.find(l => topicLower.includes(l));
        if (lang) languages[lang] = (languages[lang] || 0) + 1;
      } else if (frameworkList.some(fw => topicLower.includes(fw))) {
        const fw = frameworkList.find(f => topicLower.includes(f));
        if (fw) frameworks[fw] = (frameworks[fw] || 0) + 1;
      } else if (toolList.some(tool => topicLower.includes(tool))) {
        const tool = toolList.find(t => topicLower.includes(t));
        if (tool) tools[tool] = (tools[tool] || 0) + 1;
      }
    }
    
    return { languages, frameworks, tools };
  }

  /**
   * コミュニケーションスタイルの分析
   */
  private analyzeCommStyle($: cheerio.CheerioAPI, articles: Array<{ title: string; content: string }>): string {
    if (articles.length === 0) {
      return '情報不足のため分析できません';
    }
    
    // 記事の数
    const count = articles.length;
    
    // タイトルの平均文字数
    const avgTitleLength = articles.reduce((sum, a) => sum + a.title.length, 0) / count;
    
    // 内容の平均文字数
    const avgContentLength = articles.reduce((sum, a) => sum + a.content.length, 0) / count;
    
    // コードブロックの数
    let codeBlockCount = 0;
    $('pre, code').each(() => { codeBlockCount++; });
    
    // 画像の数
    let imageCount = 0;
    $('img').each(() => { imageCount++; });
    
    // スタイル分析
    if (codeBlockCount > count * 0.7) {
      return '技術的な解説を重視するスタイル';
    } else if (imageCount > count * 2) {
      return 'ビジュアルを重視するスタイル';
    } else if (avgContentLength > 3000) {
      return '詳細な説明を好むスタイル';
    } else if (avgContentLength < 1000) {
      return '簡潔な発信を好むスタイル';
    } else if (avgTitleLength > 50) {
      return '具体的なタイトルで内容を明確にするスタイル';
    }
    
    return 'バランスの取れたコミュニケーションスタイル';
  }

  /**
   * 投稿頻度の推測（月間平均）
   */
  private estimatePostFrequency(articles: Array<{ date?: string }>): number {
    // 日付情報がある記事を抽出
    const articlesWithDates = articles.filter(a => a.date).map(a => {
      try {
        return { date: new Date(a.date || '') };
      } catch (error) {
        return null;
      }
    }).filter(Boolean) as Array<{ date: Date }>;
    
    if (articlesWithDates.length < 2) return articles.length / 12; // 日付情報が不足している場合は概算
    
    // 日付でソート
    articlesWithDates.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // 最新と最古の記事の日付を取得
    const oldestDate = articlesWithDates[0].date;
    const newestDate = articlesWithDates[articlesWithDates.length - 1].date;
    
    // 月数の計算
    const monthsDiff = (newestDate.getFullYear() - oldestDate.getFullYear()) * 12 + 
                       (newestDate.getMonth() - oldestDate.getMonth());
    
    return monthsDiff > 0 ? articles.length / monthsDiff : articles.length;
  }

  /**
   * 仕事のスタイルを推測
   */
  private inferWorkStyle(articles: Array<{ title: string; content: string }>): string {
    if (articles.length === 0) {
      return '情報不足のため分析できません';
    }
    
    const text = articles.map(a => a.title + ' ' + a.content).join(' ').toLowerCase();
    
    // チーム関連のキーワード
    const teamKeywords = ['team', 'collaboration', 'agile', 'scrum', 'kanban', 'together', 'チーム', '協力', '協働'];
    const hasTeamFocus = teamKeywords.some(kw => text.includes(kw));
    
    // 個人関連のキーワード
    const individualKeywords = ['personal', 'individual', 'solo', 'self', '個人', '一人'];
    const hasIndividualFocus = individualKeywords.some(kw => text.includes(kw));
    
    // リーダーシップ関連のキーワード
    const leadershipKeywords = ['lead', 'leadership', 'manage', 'management', 'strategy', 'vision', 'リーダー', '戦略', 'マネジメント'];
    const hasLeadershipFocus = leadershipKeywords.some(kw => text.includes(kw));
    
    // 技術的詳細関連のキーワード
    const technicalKeywords = ['detail', 'implementation', 'code', 'architecture', 'design', 'pattern', '実装', 'コード', '設計'];
    const hasTechnicalFocus = technicalKeywords.some(kw => text.includes(kw));
    
    // 教育関連のキーワード
    const educationalKeywords = ['teach', 'learn', 'education', 'tutorial', 'guide', 'how-to', '学習', '教育', 'チュートリアル'];
    const hasEducationalFocus = educationalKeywords.some(kw => text.includes(kw));
    
    // スタイル分析
    if (hasEducationalFocus && hasTechnicalFocus) {
      return '知識共有を重視する教育的なスタイル';
    } else if (hasLeadershipFocus && hasTeamFocus) {
      return 'チームリーダーシップを重視するスタイル';
    } else if (hasTeamFocus) {
      return '協調性を重視するスタイル';
    } else if (hasIndividualFocus && hasTechnicalFocus) {
      return '技術的な深掘りを好む個人作業スタイル';
    } else if (hasTechnicalFocus) {
      return '技術的な詳細にこだわるスタイル';
    } else if (hasLeadershipFocus) {
      return 'ビジョンや戦略を重視するスタイル';
    } else if (hasEducationalFocus) {
      return '教育や知識共有を重視するスタイル';
    }
    
    return 'バランスの取れた仕事のスタイル';
  }
}
