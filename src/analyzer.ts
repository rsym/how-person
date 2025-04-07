import { AnalysisRequest, AnalysisResult, Platform, PlatformAnalysis, TechStack, Personality } from './types.js';
import { GitHubService } from './services/github.js';
import { TwitterService } from './services/twitter.js';
import { SpeakerDeckService } from './services/speakerdeck.js';
import { BlogService } from './services/blog.js';

export class PersonAnalyzer {
  private githubService: GitHubService;
  private twitterService: TwitterService;
  private speakerDeckService: SpeakerDeckService;
  private blogService: BlogService;
  
  constructor(
    githubToken?: string,
    twitterToken?: string
  ) {
    this.githubService = new GitHubService(githubToken);
    this.twitterService = new TwitterService(twitterToken);
    this.speakerDeckService = new SpeakerDeckService();
    this.blogService = new BlogService();
  }

  /**
   * 複数のプラットフォームからデータを取得して分析
   */
  public async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    const platformAnalyses: PlatformAnalysis[] = [];
    
    try {
      // GitHub分析
      if (request.github) {
        try {
          const githubAnalysis = await this.githubService.analyze(request.github);
          platformAnalyses.push(githubAnalysis);
        } catch (error) {
          console.error('GitHub分析エラー:', error);
        }
      }
      
      // Twitter分析
      if (request.twitter) {
        try {
          const twitterAnalysis = await this.twitterService.analyze(request.twitter);
          platformAnalyses.push(twitterAnalysis);
        } catch (error) {
          console.error('Twitter分析エラー:', error);
        }
      }
      
      // SpeakerDeck分析
      if (request.speakerdeck) {
        try {
          const speakerDeckAnalysis = await this.speakerDeckService.analyze(request.speakerdeck);
          platformAnalyses.push(speakerDeckAnalysis);
        } catch (error) {
          console.error('SpeakerDeck分析エラー:', error);
        }
      }
      
      // ブログ分析
      if (request.blog) {
        try {
          const blogAnalysis = await this.blogService.analyze(request.blog);
          platformAnalyses.push(blogAnalysis);
        } catch (error) {
          console.error('ブログ分析エラー:', error);
        }
      }
      
      // 分析結果の統合
      const techStack = this.mergeTechStacks(platformAnalyses);
      const personality = this.mergePersonalities(platformAnalyses);
      const summary = this.generateSummary(platformAnalyses, techStack, personality);
      
      return {
        platforms: platformAnalyses,
        techStack,
        personality,
        summary
      };
    } catch (error) {
      console.error('分析エラー:', error);
      throw new Error(`分析中にエラーが発生しました: ${error}`);
    }
  }

  /**
   * 各プラットフォームの技術スタック情報を統合
   */
  private mergeTechStacks(analyses: PlatformAnalysis[]): TechStack {
    const languages: Record<string, number> = {};
    const frameworks: Record<string, number> = {};
    const tools: Record<string, number> = {};
    const topicsSet = new Set<string>();
    
    // 各プラットフォームのデータを統合
    for (const analysis of analyses) {
      // 言語
      if (analysis.techStack.languages) {
        for (const [lang, score] of Object.entries(analysis.techStack.languages)) {
          languages[lang] = (languages[lang] || 0) + score;
        }
      }
      
      // フレームワーク
      if (analysis.techStack.frameworks) {
        for (const [fw, score] of Object.entries(analysis.techStack.frameworks)) {
          frameworks[fw] = (frameworks[fw] || 0) + score;
        }
      }
      
      // ツール
      if (analysis.techStack.tools) {
        for (const [tool, score] of Object.entries(analysis.techStack.tools)) {
          tools[tool] = (tools[tool] || 0) + score;
        }
      }
      
      // トピック
      if (analysis.techStack.topics) {
        for (const topic of analysis.techStack.topics) {
          topicsSet.add(topic);
        }
      }
    }
    
    // 言語、フレームワーク、ツールをスコア順にソート
    const sortByScore = (a: [string, number], b: [string, number]) => b[1] - a[1];
    
    const sortedLanguages = Object.fromEntries(
      Object.entries(languages).sort(sortByScore)
    );
    
    const sortedFrameworks = Object.fromEntries(
      Object.entries(frameworks).sort(sortByScore)
    );
    
    const sortedTools = Object.fromEntries(
      Object.entries(tools).sort(sortByScore)
    );
    
    return {
      languages: sortedLanguages,
      frameworks: sortedFrameworks,
      tools: sortedTools,
      topics: Array.from(topicsSet)
    };
  }

  /**
   * 各プラットフォームの人となり情報を統合
   */
  private mergePersonalities(analyses: PlatformAnalysis[]): Personality {
    const interestsSet = new Set<string>();
    const activitiesSet = new Set<string>();
    const communicationTopicsSet = new Set<string>();
    const communicationStyles: string[] = [];
    let communicationFrequency = 0;
    const workStyles: string[] = [];
    
    // 各プラットフォームのデータを統合
    for (const analysis of analyses) {
      // 興味・関心
      if (analysis.personality.interests) {
        for (const interest of analysis.personality.interests) {
          interestsSet.add(interest);
        }
      }
      
      // 活動内容
      if (analysis.personality.activities) {
        for (const activity of analysis.personality.activities) {
          activitiesSet.add(activity);
        }
      }
      
      // コミュニケーションスタイル
      if (analysis.personality.communication?.style) {
        communicationStyles.push(analysis.personality.communication.style);
      }
      
      // コミュニケーション頻度（平均値を計算）
      if (analysis.personality.communication?.frequency) {
        communicationFrequency += analysis.personality.communication.frequency;
      }
      
      // コミュニケーショントピック
      if (analysis.personality.communication?.topics) {
        for (const topic of analysis.personality.communication.topics) {
          communicationTopicsSet.add(topic);
        }
      }
      
      // 仕事のスタイル
      if (analysis.personality.workStyle) {
        workStyles.push(analysis.personality.workStyle);
      }
    }
    
    // コミュニケーション頻度の平均を計算
    const avgCommunicationFrequency = analyses.length > 0 
      ? communicationFrequency / analyses.length 
      : 0;
    
    // 最も多く出現する仕事のスタイルを選択
    const workStyleCounts: Record<string, number> = {};
    for (const style of workStyles) {
      workStyleCounts[style] = (workStyleCounts[style] || 0) + 1;
    }
    
    const dominantWorkStyle = Object.entries(workStyleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([style]) => style)[0] || undefined;
    
    return {
      interests: Array.from(interestsSet),
      activities: Array.from(activitiesSet),
      communication: {
        style: this.summarizeCommunicationStyle(communicationStyles),
        frequency: avgCommunicationFrequency,
        topics: Array.from(communicationTopicsSet),
      },
      workStyle: dominantWorkStyle,
    };
  }

  /**
   * コミュニケーションスタイルの要約
   */
  private summarizeCommunicationStyle(styles: string[]): string {
    if (styles.length === 0) {
      return '情報不足のため分析できません';
    }
    
    if (styles.length === 1) {
      return styles[0];
    }
    
    // キーワードの出現頻度を計算
    const keywords: Record<string, number> = {};
    const keywordPatterns = [
      { pattern: /技術|詳細|解説|コード|実装/i, keyword: '技術的' },
      { pattern: /教育|共有|チュートリアル|学習/i, keyword: '教育的' },
      { pattern: /リーダー|マネジメント|戦略|ビジョン/i, keyword: 'リーダーシップ' },
      { pattern: /チーム|協力|協調|協働/i, keyword: '協調的' },
      { pattern: /個人|一人|ソロ/i, keyword: '個人的' },
      { pattern: /簡潔|シンプル/i, keyword: '簡潔' },
      { pattern: /詳細|丁寧|深い/i, keyword: '詳細' },
      { pattern: /バランス/i, keyword: 'バランス' },
      { pattern: /影響力|発信/i, keyword: '発信力' },
    ];
    
    for (const style of styles) {
      for (const { pattern, keyword } of keywordPatterns) {
        if (pattern.test(style)) {
          keywords[keyword] = (keywords[keyword] || 0) + 1;
        }
      }
    }
    
    // 最も多く出現するキーワードを抽出
    const sortedKeywords = Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .map(([keyword]) => keyword);
    
    if (sortedKeywords.length === 0) {
      return styles[0]; // キーワードが抽出できない場合は最初のスタイルを返す
    }
    
    // 上位2つのキーワードを組み合わせる
    if (sortedKeywords.length >= 2) {
      return `${sortedKeywords[0]}かつ${sortedKeywords[1]}なコミュニケーションスタイル`;
    }
    
    return `${sortedKeywords[0]}なコミュニケーションスタイル`;
  }

  /**
   * 分析結果の要約を生成
   */
  private generateSummary(
    analyses: PlatformAnalysis[],
    techStack: TechStack,
    personality: Personality
  ): string {
    // 分析対象のプラットフォーム
    const platforms = analyses.map(a => {
      switch (a.platform) {
        case Platform.GITHUB: return 'GitHub';
        case Platform.TWITTER: return 'Twitter/X';
        case Platform.SPEAKERDECK: return 'SpeakerDeck';
        case Platform.BLOG: return 'ブログ';
        default: return a.platform;
      }
    }).join('、');
    
    // 主要な技術スタック
    const topLanguages = Object.keys(techStack.languages).slice(0, 3);
    const topFrameworks = Object.keys(techStack.frameworks).slice(0, 3);
    const topTools = Object.keys(techStack.tools).slice(0, 3);
    
    // 主要な興味・関心
    const topInterests = personality.interests.slice(0, 5);
    
    // 要約文の生成
    let summary = `${platforms}の分析結果に基づく要約：\n\n`;
    
    // 技術スタックの要約
    summary += `【技術スタック】\n`;
    if (topLanguages.length > 0) {
      summary += `・主な使用言語: ${topLanguages.join('、')}\n`;
    }
    if (topFrameworks.length > 0) {
      summary += `・主なフレームワーク: ${topFrameworks.join('、')}\n`;
    }
    if (topTools.length > 0) {
      summary += `・主なツール: ${topTools.join('、')}\n`;
    }
    
    // 人となりの要約
    summary += `\n【人となり】\n`;
    if (topInterests.length > 0) {
      summary += `・興味・関心: ${topInterests.join('、')}\n`;
    }
    if (personality.communication?.style) {
      summary += `・コミュニケーションスタイル: ${personality.communication.style}\n`;
    }
    if (personality.workStyle) {
      summary += `・仕事のスタイル: ${personality.workStyle}\n`;
    }
    
    // 活動内容の要約
    if (personality.activities.length > 0) {
      summary += `\n【活動内容】\n`;
      for (const activity of personality.activities.slice(0, 3)) {
        if (activity.trim()) {
          summary += `・${activity}\n`;
        }
      }
    }
    
    return summary;
  }
}
