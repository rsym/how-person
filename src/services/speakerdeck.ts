import axios from 'axios';
import * as cheerio from 'cheerio';
import { Platform, PlatformAnalysis, Personality } from '../types.js';

export class SpeakerDeckService {
  /**
   * SpeakerDeckのURLからユーザー名を抽出
   */
  private extractUsername(url: string): string {
    const match = url.match(/speakerdeck\.com\/([^\/\?]+)/);
    if (!match) {
      throw new Error('Invalid SpeakerDeck URL');
    }
    return match[1];
  }

  /**
   * SpeakerDeckユーザーの情報を取得して分析
   */
  public async analyze(url: string): Promise<PlatformAnalysis> {
    const username = this.extractUsername(url);
    
    try {
      // ユーザーページのHTMLを取得
      const response = await axios.get(`https://speakerdeck.com/${username}`);
      const $ = cheerio.load(response.data);
      
      // プレゼンテーション一覧を取得
      const presentations: Array<{
        title: string;
        description: string;
        url: string;
        date: string;
      }> = [];
      
      // プレゼンテーションカードを抽出
      $('.talk-listing .container').each((_, element) => {
        const titleElement = $(element).find('h3.title');
        const title = titleElement.text().trim();
        const url = 'https://speakerdeck.com' + titleElement.find('a').attr('href');
        const description = $(element).find('.description').text().trim();
        const date = $(element).find('.date').text().trim();
        
        presentations.push({
          title,
          description,
          url,
          date
        });
      });
      
      // プロフィール情報を取得
      const profileName = $('.profile-header h1').text().trim();
      const profileBio = $('.profile-header .bio').text().trim();
      
      // プレゼンテーションからトピックを抽出
      const topics = this.extractTopicsFromPresentations(presentations);
      
      // 技術スタックの推測
      const techStack = this.inferTechStack(presentations, topics);
      
      // 人となりの分析
      const personality: Partial<Personality> = {
        interests: Array.from(topics).slice(0, 10),
        activities: [
          profileBio,
          `${presentations.length}件のプレゼンテーションを公開`,
        ].filter(Boolean),
        communication: {
          style: this.analyzeCommStyle(presentations),
          frequency: presentations.length > 0 ? presentations.length / 12 : 0, // 年間平均（概算）
          topics: Array.from(topics).slice(0, 5),
        },
        workStyle: this.inferWorkStyle(presentations),
      };

      return {
        platform: Platform.SPEAKERDECK,
        url,
        techStack: {
          topics: Array.from(topics),
          ...techStack,
        },
        personality,
        rawData: { profile: { name: profileName, bio: profileBio }, presentations },
      };
    } catch (error) {
      console.error('SpeakerDeck scraping error:', error);
      throw new Error(`SpeakerDeck分析中にエラーが発生しました: ${error}`);
    }
  }

  /**
   * プレゼンテーションからトピックを抽出
   */
  private extractTopicsFromPresentations(presentations: Array<{ title: string; description: string }>): Set<string> {
    const topics = new Set<string>();
    
    // 技術関連のキーワードリスト
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
    
    for (const presentation of presentations) {
      const text = (presentation.title + ' ' + presentation.description).toLowerCase();
      
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
    presentations: Array<{ title: string; description: string }>,
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
    
    // プレゼンテーションのタイトルと説明から技術スタックを推測
    for (const presentation of presentations) {
      const text = (presentation.title + ' ' + presentation.description).toLowerCase();
      
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
  private analyzeCommStyle(presentations: Array<{ title: string; description: string }>): string {
    if (presentations.length === 0) {
      return '情報不足のため分析できません';
    }
    
    // プレゼンテーションの数
    const count = presentations.length;
    
    // タイトルの平均文字数
    const avgTitleLength = presentations.reduce((sum, p) => sum + p.title.length, 0) / count;
    
    // 説明の平均文字数
    const avgDescLength = presentations.reduce((sum, p) => sum + (p.description?.length || 0), 0) / count;
    
    // 技術的なプレゼンテーションの割合
    const techKeywords = ['code', 'programming', 'development', 'software', 'tech', 'technology'];
    const techPresentations = presentations.filter(p => 
      techKeywords.some(kw => (p.title + ' ' + p.description).toLowerCase().includes(kw))
    );
    const techRatio = techPresentations.length / count;
    
    // スタイル分析
    if (count > 20) {
      return '積極的に知識を共有するスタイル';
    } else if (avgDescLength > 200) {
      return '詳細な説明を好むスタイル';
    } else if (avgTitleLength > 50) {
      return '具体的なタイトルで内容を明確にするスタイル';
    } else if (techRatio > 0.7) {
      return '技術的な内容に特化したスタイル';
    }
    
    return '多様なトピックをバランスよく発表するスタイル';
  }

  /**
   * 仕事のスタイルを推測
   */
  private inferWorkStyle(presentations: Array<{ title: string; description: string }>): string {
    if (presentations.length === 0) {
      return '情報不足のため分析できません';
    }
    
    const text = presentations.map(p => p.title + ' ' + p.description).join(' ').toLowerCase();
    
    // チーム関連のキーワード
    const teamKeywords = ['team', 'collaboration', 'agile', 'scrum', 'kanban', 'together'];
    const hasTeamFocus = teamKeywords.some(kw => text.includes(kw));
    
    // 個人関連のキーワード
    const individualKeywords = ['personal', 'individual', 'solo', 'self'];
    const hasIndividualFocus = individualKeywords.some(kw => text.includes(kw));
    
    // リーダーシップ関連のキーワード
    const leadershipKeywords = ['lead', 'leadership', 'manage', 'management', 'strategy', 'vision'];
    const hasLeadershipFocus = leadershipKeywords.some(kw => text.includes(kw));
    
    // 技術的詳細関連のキーワード
    const technicalKeywords = ['detail', 'implementation', 'code', 'architecture', 'design', 'pattern'];
    const hasTechnicalFocus = technicalKeywords.some(kw => text.includes(kw));
    
    // スタイル分析
    if (hasLeadershipFocus && hasTeamFocus) {
      return 'チームリーダーシップを重視するスタイル';
    } else if (hasTeamFocus) {
      return '協調性を重視するスタイル';
    } else if (hasIndividualFocus && hasTechnicalFocus) {
      return '技術的な深掘りを好む個人作業スタイル';
    } else if (hasTechnicalFocus) {
      return '技術的な詳細にこだわるスタイル';
    } else if (hasLeadershipFocus) {
      return 'ビジョンや戦略を重視するスタイル';
    }
    
    return 'バランスの取れた仕事のスタイル';
  }
}
