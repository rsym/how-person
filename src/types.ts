/**
 * 分析対象のプラットフォーム
 */
export enum Platform {
  GITHUB = 'github',
  TWITTER = 'twitter',
  SPEAKERDECK = 'speakerdeck',
  BLOG = 'blog'
}

/**
 * 技術スタック情報
 */
export interface TechStack {
  languages: { [language: string]: number }; // 言語名とその使用頻度/スコア
  frameworks: { [framework: string]: number }; // フレームワーク名とその使用頻度/スコア
  tools: { [tool: string]: number }; // ツール名とその使用頻度/スコア
  topics: string[]; // 関心のあるトピック
}

/**
 * 人となり情報
 */
export interface Personality {
  interests: string[]; // 興味・関心
  activities: string[]; // 活動内容
  communication: {
    style?: string; // コミュニケーションスタイル
    frequency?: number; // 発信頻度
    topics?: string[]; // よく話すトピック
  };
  workStyle?: string; // 仕事のスタイル
}

/**
 * プラットフォームごとの分析結果
 */
export interface PlatformAnalysis {
  platform: Platform;
  url: string;
  techStack: Partial<TechStack>;
  personality: Partial<Personality>;
  rawData?: any; // 生データ（オプション）
}

/**
 * 総合分析結果
 */
export interface AnalysisResult {
  platforms: PlatformAnalysis[];
  techStack: TechStack;
  personality: Personality;
  summary: string;
}

/**
 * 分析リクエスト
 */
export interface AnalysisRequest {
  github?: string;
  twitter?: string;
  speakerdeck?: string;
  blog?: string;
}
