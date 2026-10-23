import type { ArticleNavigation as ArticleNavigationData } from '../lib/types';
import { postHref } from '../lib/post-links';
import './navigation.css';

export function ArticleNavigation({ navigation }: { navigation?: ArticleNavigationData }) {
  if (!navigation || (!navigation.previous && !navigation.next)) return null;
  return <nav className="article-navigation" aria-label="继续阅读" data-prev={navigation.previous?.id} data-next={navigation.next?.id}>
    <div className="article-neighbors">
      {navigation.previous ? <a href={postHref(navigation.previous)} rel="prev" aria-label={`上一篇：${navigation.previous.title}`}><small>← 上一篇</small><strong>{navigation.previous.title}</strong></a> : <span/>}
      {navigation.next ? <a href={postHref(navigation.next)} rel="next" aria-label={`下一篇：${navigation.next.title}`}><small>下一篇 →</small><strong>{navigation.next.title}</strong></a> : <span/>}
    </div>
  </nav>;
}
