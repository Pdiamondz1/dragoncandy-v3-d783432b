// Pure builder for a wiki page imported from a Workspace Doc. Sibling of
// wiki-save-answer's buildPage. Dependency-free → Vitest in CI.

const TYPE_BY_FOLDER: Record<string, string> = { concepts: 'concept', analyses: 'analysis' };

export function buildImportedPage(opts: {
  title: string; folder: string; tags: string[]; markdown: string; fileId: string; today: string;
}): string {
  const { title, folder, tags, markdown, fileId, today } = opts;
  const safeTitle = title.replace(/[\r\n]+/g, ' ').trim();
  const fm = [
    '---',
    `title: ${safeTitle}`,
    `type: ${TYPE_BY_FOLDER[folder]}`,
    `created: ${today}`,
    `updated: ${today}`,
    'sources: [workspace]',
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    `# ${safeTitle}`,
    '',
    `> Imported from a Google Workspace doc (id \`${fileId}\`) on ${today}.`,
    '',
  ];
  return [...fm, markdown.trim(), ''].join('\n');
}
