import { z } from 'zod';
import type { HomeOverview, Post, PostStatistics, SiteSettings } from './types';
import type { PublicComment } from './interaction-types';
import type { GithubContributions } from './github-contribution-types';

const text = z.string();
const resume = z.object({id:text,organization:text,title:text,period:text,description:text,url:text,coverImage:text.optional()});
const comment = z.object({id:text,postId:text,nickname:text,content:text,provider:z.enum(['','qq','github']),avatar:text,parentId:text.nullable(),replyTo:text.nullable(),isAdmin:z.boolean(),createdAt:text});
export const pagesGithubSchema = z.discriminatedUnion('status',[
  z.object({status:z.literal('disabled')}),
  z.object({status:z.literal('unavailable'),username:text}),
  z.object({status:z.literal('ready'),username:text,calendar:z.object({total:z.number().nonnegative(),days:z.array(z.object({date:text,count:z.number().nonnegative(),level:z.number().int().min(0).max(4)})).max(380)}),updatedAt:text,stale:z.boolean()}),
]);
// An explicit allowlist is applied on both sides of the public export boundary.
export const pagesSnapshotSchema = z.object({
  version:z.literal(1), generatedAt:text,
  settings:z.object({name:text,bio:text,description:text,avatar:text,homeBackground:text,github:text,xiaohongshu:text,bilibili:text,douyin:text,email:text,location:text,education:text,educationEntries:z.array(resume),experienceEntries:z.array(resume),sponsorWechat:text,sponsorAlipay:text,startedAt:text}),
  posts:z.array(z.object({id:text.regex(/^[a-zA-Z0-9_-]{1,160}$/),title:text,excerpt:text,content:text,category:z.enum(['Daily Life','Technical']),tags:z.array(text),cityIds:z.array(text),status:z.literal('published'),coverImage:text,coverSize:z.object({width:z.number().positive(),height:z.number().positive()}).optional(),viewCount:z.number().nonnegative(),publishedAt:text,createdAt:text,updatedAt:text})).max(10000),
  stats:z.object({words:z.number().nonnegative(),total:z.number().nonnegative(),published:z.number().nonnegative(),drafts:z.literal(0)}),
  home:z.object({today:text,firstPublishedAt:text.nullable(),lastUpdatedAt:text.nullable(),activity:z.array(z.object({date:text,count:z.number().nonnegative()})),traffic:z.object({pageViews:z.number().nonnegative(),articleViews:z.number().nonnegative()}).optional(),github:z.object({username:text.nullable(),configured:z.boolean()}).optional()}),
  interactions:z.record(z.object({likes:z.number().nonnegative(),comments:z.array(comment)})),
});

export interface PagesSnapshot {
  version:1; generatedAt:string; settings:SiteSettings; posts:Post[];
  stats:PostStatistics; home:HomeOverview;
  interactions:Record<string,{likes:number;comments:PublicComment[]}>;
  github?:GithubContributions;
}
