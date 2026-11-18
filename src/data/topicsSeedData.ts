import { TopicArticle, TopicCategory } from '../types/lexicon';

export const TOPIC_CATEGORY_META: Record<
  TopicCategory | 'All',
  { labelAr: string; labelEn: string }
> = {
  All: { labelAr: 'جميع المواضيع', labelEn: 'All Topics' },
  Medical: { labelAr: 'الطب السريري', labelEn: 'Clinical Medicine' },
  Technology: { labelAr: 'التكنولوجيا والأنظمة', labelEn: 'Technology & Systems' },
  AI: { labelAr: 'الذكاء الاصطناعي', labelEn: 'Artificial Intelligence' },
  History: { labelAr: 'التاريخ والحضارة', labelEn: 'History & Heritage' },
  General: { labelAr: 'العلوم والمعرفة العامة', labelEn: 'General Sciences' }
};

// Topic content is loaded from UMEDT-DATA or created by the user, never bundled in the APK.
export const INITIAL_TOPICS: TopicArticle[] = [];
