import { createDirectus, rest, staticToken } from '@directus/sdk';

export interface Box {
  id: string;
  name: string;
  description: string;
  unique_id: string;
}

export interface ComponentPackage {
  id: number;
  name: string;
}

export interface ComponentType {
  id: number;
  name: string;
  subcategory: string;
}

export interface ComponentFile {
  id: number;
  components_id: number;
  directus_files_id: string;
}

export interface Component {
  id: number;
  name: string;
  description: string;
  main_image: string; // File ID
  datasheet: string; // File ID
  quantity_available: number;
  location: string | Box; // Box ID or Box object
  url: string | null;
  keywords: string[] | null;
  packet_reference: string | null;
  package: number | ComponentPackage; // Package ID or Package object
  type: number | ComponentType; // Type ID or Type object
  barcode: string | null;
  other_images?: ComponentFile[];
  other_files?: ComponentFile[];
  date_created?: string;
}

export interface Schema {
  boxes: Box[];
  components_packages: ComponentPackage[];
  components_types: ComponentType[];
  components: Component[];
  components_files: ComponentFile[];
  components_files_1: ComponentFile[];
}

const DIRECTUS_URL = typeof window !== 'undefined' ? `${window.location.origin}/directus` : '/directus';
const DIRECTUS_TOKEN = 'MprhfY1x9EXUx-JIcxMnUzF6jY3lyC-Y';

const loggingFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString();
  const method = init?.method || 'GET';
  
  let bodyLog = '';
  if (init?.body) {
    if (typeof init.body === 'string') {
      try {
        bodyLog = JSON.parse(init.body);
      } catch {
        bodyLog = init.body;
      }
    } else {
      bodyLog = '[Non-string body]';
    }
  }

  console.log(`[Directus Request] ${method} ${url}`, bodyLog);
  
  try {
    const response = await fetch(input, init);
    console.log(`[Directus Response] ${response.status} ${url}`);
    
    // Dispatch error if backend is completely down (Gateway timeouts, Bad Gateway)
    if (!response.ok && (response.status === 502 || response.status === 503 || response.status === 504)) {
      window.dispatchEvent(new CustomEvent('directus-error'));
    }
    
    return response;
  } catch (error) {
    console.error(`[Directus Error] ${method} ${url}`, error);
    // Network error (CORS, offline, DNS, server dead)
    window.dispatchEvent(new CustomEvent('directus-error'));
    throw error;
  }
};

export const directus = createDirectus<Schema>(DIRECTUS_URL, {
  globals: {
    fetch: loggingFetch
  }
})
  .with(staticToken(DIRECTUS_TOKEN))
  .with(rest());

export const getFileUrl = (fileId: string) => `${DIRECTUS_URL}/assets/${fileId}?access_token=${DIRECTUS_TOKEN}`;
