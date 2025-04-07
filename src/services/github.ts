import { Octokit } from '@octokit/rest';
import { Platform, PlatformAnalysis, TechStack, Personality } from '../types.js';

export class GitHubService {
  private octokit: Octokit;
  
  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  /**
   * GitHubのURLからユーザー名を抽出
   */
  private extractUsername(url: string): string {
    const match = url.match(/github\.com\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }
    return match[1];
  }

  /**
   * GitHubユーザーの情報を取得して分析
   */
  public async analyze(url: string): Promise<PlatformAnalysis> {
    const username = this.extractUsername(url);
    
    try {
      // ユーザー情報の取得
      const { data: user } = await this.octokit.users.getByUsername({
        username,
      });

      // リポジトリ情報の取得
      const { data: repos } = await this.octokit.repos.listForUser({
        username,
        per_page: 100,
        sort: 'updated',
      });

      // 言語情報の集計
      const languages: { [key: string]: number } = {};
      const frameworks: { [key: string]: number } = {};
      const tools: { [key: string]: number } = {};
      const topics: Set<string> = new Set();

      // リポジトリごとの言語情報を取得
      for (const repo of repos) {
        if (repo.fork) continue; // フォークしたリポジトリはスキップ
        
        // 言語情報の取得
        try {
          const { data: repoLanguages } = await this.octokit.repos.listLanguages({
            owner: username,
            repo: repo.name,
          });
          
          // 言語の使用頻度を集計
          for (const [lang, bytes] of Object.entries(repoLanguages)) {
            languages[lang] = (languages[lang] || 0) + bytes;
          }
        } catch (error) {
          console.error(`Failed to fetch languages for ${repo.name}:`, error);
        }
        
        // トピックの取得
        if (repo.topics && repo.topics.length > 0) {
          repo.topics.forEach(topic => {
            topics.add(topic);
            
            // フレームワークやツールの検出
            this.categorizeTopics(topic, frameworks, tools);
          });
        }
      }

      // READMEの分析（オプション）
      // ...

      // 技術スタックの構築
      const techStack: Partial<TechStack> = {
        languages,
        frameworks,
        tools,
        topics: Array.from(topics),
      };

      // 人となりの分析
      const personality: Partial<Personality> = {
        interests: Array.from(topics).slice(0, 10), // トップ10のトピックを興味として扱う
        activities: [
          user.bio || '',
          `${repos.length}個のリポジトリを所有`,
          user.company ? `${user.company}に所属` : '',
        ].filter(Boolean),
        communication: {
          style: this.analyzeCommStyle(user, repos),
        },
      };

      return {
        platform: Platform.GITHUB,
        url,
        techStack,
        personality,
        rawData: { user, repos },
      };
    } catch (error) {
      console.error('GitHub API error:', error);
      throw new Error(`GitHub分析中にエラーが発生しました: ${error}`);
    }
  }

  /**
   * トピックをフレームワークとツールに分類
   */
  private categorizeTopics(
    topic: string, 
    frameworks: { [key: string]: number }, 
    tools: { [key: string]: number }
  ): void {
    // 一般的なフレームワークのリスト
    const frameworkList = [
      'react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'gatsby',
      'express', 'koa', 'nest', 'fastify', 'hapi',
      'django', 'flask', 'fastapi', 'spring', 'rails', 'laravel',
      'tensorflow', 'pytorch', 'keras',
    ];
    
    // 一般的なツールのリスト
    const toolList = [
      'webpack', 'babel', 'eslint', 'prettier', 'jest', 'mocha', 'cypress',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'firebase',
      'graphql', 'apollo', 'redux', 'mobx', 'zustand',
      'git', 'github', 'gitlab', 'bitbucket',
    ];
    
    if (frameworkList.some(fw => topic.includes(fw))) {
      frameworks[topic] = (frameworks[topic] || 0) + 1;
    } else if (toolList.some(tool => topic.includes(tool))) {
      tools[topic] = (tools[topic] || 0) + 1;
    }
  }

  /**
   * コミュニケーションスタイルの分析
   */
  private analyzeCommStyle(user: any, repos: any[]): string {
    // 簡易的な分析ロジック
    const hasDetailedReadmes = repos.some(r => r.description && r.description.length > 100);
    const hasMultipleContributors = repos.some(r => r.contributors_url && r.contributors_url.length > 1);
    const hasManyStars = repos.some(r => r.stargazers_count > 50);
    
    if (hasManyStars && hasDetailedReadmes) {
      return 'オープンで詳細なドキュメントを重視するスタイル';
    } else if (hasMultipleContributors) {
      return '協調的なスタイル';
    } else if (repos.length > 20) {
      return '多くのプロジェクトに取り組む探究心旺盛なスタイル';
    }
    
    return '個人的な開発に集中するスタイル';
  }
}
