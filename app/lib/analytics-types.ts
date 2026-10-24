export interface TrafficTotals {
  pageViews: number;
  articleViews: number;
}

export interface RecordedPageView extends TrafficTotals {
  path: string;
  postViews: number | null;
  counted: boolean;
  excluded: boolean;
}
