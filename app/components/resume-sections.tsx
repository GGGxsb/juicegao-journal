// React adaptation of Axi-Theme's home Section and Card (Apache-2.0).
// Source links and adaptations are recorded in docs/axi-theme-reference.md.
import type { ResumeEntry, SiteSettings } from '../lib/types';
import { Markdown } from './markdown';
import CardCover from './card-cover';
import {resumeImageUrl} from '../lib/resume-image';
import './resume-sections.css';

function entryLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function ResumeCards({entries}: {entries: ResumeEntry[]}) {
  return <ol className="resume-card-list">{entries.map(entry => {
    const url = entryLink(entry.url),cover=resumeImageUrl(entry.coverImage);
    return <li key={entry.id}>
      <article className={`resume-card${cover?' has-cover':''}`} data-resume-id={entry.id} data-cover-card>
        <div className="resume-card-body">
          <div className="resume-card-heading">
            <h3 className="resume-organization">{url ? <a className="resume-card-link" href={url} target="_blank" rel="noopener noreferrer">{entry.organization}</a> : entry.organization}</h3>
            {entry.title && <p className="resume-title">{entry.title}</p>}
            {entry.period && <p className="resume-period" title={entry.period}>{entry.period}</p>}
          </div>
          {entry.description && <div className="resume-detail"><Markdown content={entry.description}/></div>}
        </div>
        {cover&&<CardCover src={cover} className="resume-cover"/>}
      </article>
    </li>;
  })}</ol>;
}

export default function ResumeSections({settings}: {settings: Pick<SiteSettings,'education'|'educationEntries'|'experienceEntries'>}) {
  const education = settings.educationEntries ?? [], experience = settings.experienceEntries ?? [];
  const hasEducation = education.length > 0 || Boolean(settings.education?.trim());
  return <>
    {hasEducation && <section className="home-section resume-section" aria-labelledby="resume-education-heading">
      <h2 id="resume-education-heading">教育经历</h2>
      <div className="resume-content">
        {!!education.length && <ResumeCards entries={education}/>}
        {settings.education?.trim() && <div className="home-copy resume-detail"><Markdown content={settings.education}/></div>}
      </div>
    </section>}
    {!!experience.length && <section className="home-section resume-section" aria-labelledby="resume-experience-heading">
      <h2 id="resume-experience-heading">履历</h2>
      <div className="resume-content"><ResumeCards entries={experience}/></div>
    </section>}
  </>;
}
