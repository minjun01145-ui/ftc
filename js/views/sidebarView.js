import { PROJECT_SECTION, PROJECT_SECTION_ITEMS } from '../projectSections.js';
import { escapeHtml } from '../utils.js';

export function renderProjectList(projects, currentPage) {
  return projects.map(project => {
    const activeProject = currentPage.type === 'project' && currentPage.projectId === project.id;
    const section = activeProject ? currentPage.section : null;
    const submenu = activeProject
      ? `<div class="project-submenu">${PROJECT_SECTION_ITEMS.map(item => `
          <button type="button"
            class="project-subitem ${section === item.key ? 'active' : ''}"
            data-project-id="${escapeHtml(project.id)}"
            data-project-section="${item.key}">${item.label}</button>
        `).join('')}</div>`
      : '';

    return `
      <div class="project-group">
        <button type="button"
          class="project-item ${activeProject ? 'active' : ''}"
          data-project-id="${escapeHtml(project.id)}"
          data-project-section="${PROJECT_SECTION.BUSINESS}"
          aria-expanded="${activeProject ? 'true' : 'false'}">${escapeHtml(project.title)}</button>
        ${submenu}
      </div>`;
  }).join('');
}
