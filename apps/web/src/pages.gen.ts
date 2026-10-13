// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';

// prettier-ignore
import type { getConfig as File_YearSite_getConfig } from './pages/[year]/[site]';
// prettier-ignore
import type { getConfig as File_YearSiteId_getConfig } from './pages/[year]/[site]/[id]';
// prettier-ignore
import type { getConfig as File_YearSiteNew_getConfig } from './pages/[year]/[site]/new';
// prettier-ignore
import type { getConfig as File_YearSiteSettings_getConfig } from './pages/[year]/[site]/settings';
// prettier-ignore
import type { getConfig as File_Root_getConfig } from './pages/_root';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_Settings_getConfig } from './pages/settings';

// prettier-ignore
type Page =
| ({ path: '/[year]/[site]' } & GetConfigResponse<typeof File_YearSite_getConfig>)
| ({ path: '/[year]/[site]/[id]' } & GetConfigResponse<typeof File_YearSiteId_getConfig>)
| ({ path: '/[year]/[site]/new' } & GetConfigResponse<typeof File_YearSiteNew_getConfig>)
| ({ path: '/[year]/[site]/settings' } & GetConfigResponse<typeof File_YearSiteSettings_getConfig>)
| ({ path: '/_root' } & GetConfigResponse<typeof File_Root_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/settings' } & GetConfigResponse<typeof File_Settings_getConfig>);

// prettier-ignore
type Layout =
| { path: '/' };

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
    layouts: Layout;
  }
  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}
}
