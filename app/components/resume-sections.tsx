// React adaptation of Axi-Theme's home Section, Card and Timeline (Apache-2.0).
// Source links and adaptations are recorded in docs/axi-theme-reference.md.
import type { ResumeEntry, SiteSettings } from '../lib/types';
import { Markdown } from './markdown';
import './resume-sections.css';

function entryLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function EntryHeading({entry, cardLink = false}: {entry: ResumeEntry; cardLink?: boolean}) {
  const url = entryLink(entry.url);
  return <>
    <h3 className="resume-organization">{url ? <a className={cardLink ? 'resume-card-link' : undefined} href={url} target="_blank" rel="noopener noreferrer">{entry.organization}</a> : entry.organization}</h3>
    {entry.title && <p className="resume-title">{entry.title}</p>}
  </>;
}

export default function ResumeSections({settings}: {settings: Pick<SiteSettings,'education'|'educationEntries'|'experienceEntries'>}) {
  const education = settings.educationEntries ?? [], experience = settings.experienceEntries ?? [];
  const hasEducation = education.length > 0 || Boolean(settings.education?.trim());
  return <>
    {hasEducation && <section className="home-section resume-section" aria-labelledby="resume-education-heading">
      <h2 id="resume-education-heading">教育经历</h2>
      <div className="resume-content">
        {!!education.length && <ol className="resume-education-list">{education.map(entry => <li key={entry.id}>
          <article className="resume-education-card" data-resume-id={entry.id}>
            <div className="resume-card-heading">
              <EntryHeading entry={entry} cardLink/>
              {entry.period && <p className="resume-period">{entry.period}</p>}
            </div>
            {entry.description && <div className="resume-detail"><Markdown content={entry.description}/></div>}
          </article>
        </li>)}</ol>}
        {settings.education?.trim() && <div className="home-copy resume-detail resume-education-note"><Markdown content={settings.education}/></div>}
      </div>
    </section>}
    {!!experience.length && <section className="home-section resume-section" aria-labelledby="resume-experience-heading">
      <h2 id="resume-experience-heading">履历</h2>
      <div className="resume-content"><ol className="resume-timeline">{experience.map(entry => <li className="resume-timeline-item" key={entry.id} data-resume-id={entry.id}>
        <span className="resume-timeline-dot" aria-hidden="true"/>
        <div className="resume-timeline-event">
          {entry.period && <p className="resume-period resume-timeline-date" title={entry.period}>{entry.period}</p>}
          <article className="resume-timeline-content"><EntryHeading entry={entry}/>{entry.description && <div className="resume-detail"><Markdown content={entry.description}/></div>}</article>
        </div>
      </li>)}</ol></div>
    </section>}
  </>;
}
