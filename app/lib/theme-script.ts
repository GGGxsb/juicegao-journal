// Apply the shared preference before the first paint, including direct admin visits.
export const themeScript = `(function(){var t;try{t=localStorage.getItem('journal-theme')}catch(e){}document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()`;
