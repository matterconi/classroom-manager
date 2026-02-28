import { BACKEND_BASE_URL } from "@/constants";
import { CreateResponse, ListResponse } from "@/types";
import { HttpError } from "@refinedev/core";
import {
  createDataProvider,
  type CreateDataProviderOptions,
} from "@refinedev/rest";

const buildHttpError = async (response: Response): Promise<HttpError> => {
  let message = "Request failed";

  try {
    const payload = await response.json();

    if (payload?.message) message = payload.message;
  } catch {
    //ignore errors
  }
  return {
    message,
    statusCode: response.status,
  };
};

// Map Refine resource names to item kinds
const RESOURCE_KIND_MAP: Record<string, string> = {
  snippets: "snippet",
  theory: "snippet",
  components: "component",
  collections: "collection",
};

function getEndpoint(resource: string): string {
  if (resource in RESOURCE_KIND_MAP) return "api/items";
  return `api/${resource}`;
}

const options: CreateDataProviderOptions = {
  getList: {
    getEndpoint: ({ resource }) => getEndpoint(resource),

    buildQueryParams: async ({ resource, pagination, filters }) => {
      const page = pagination?.currentPage ?? 1;
      const pageSize = pagination?.pageSize ?? 10;

      const params: Record<string, string | number> = {
        page,
        limit: pageSize,
      };

      // Add kind for item resources
      const kind = RESOURCE_KIND_MAP[resource];
      if (kind) params.kind = kind;

      filters?.forEach((filter) => {
        const field = "field" in filter ? filter.field : "";
        const value = String(filter.value);

        if (field === "name") params.search = value;
        if (field === "categoryId") params.categoryId = value;
        if (field === "type") params.type = value;
        if (field === "domain") params.domain = value;
        if (field === "stack") params.stack = value;
        if (field === "language") params.language = value;
        if (field === "library") params.library = value;
      });

      return params;
    },

    mapResponse: async (response) => {
      if (!response.ok) throw await buildHttpError(response);
      const payload: ListResponse = await response.clone().json();

      return payload.data ?? [];
    },

    getTotalCount: async (response) => {
      if (!response.ok) throw await buildHttpError(response);
      const payload: ListResponse = await response.clone().json();

      return payload.pagination?.total ?? payload.data?.length ?? 0;
    },
  },

  getOne: {
    getEndpoint: ({ resource, id }) => {
      if (resource in RESOURCE_KIND_MAP) return `api/items/${id}`;
      return `api/${resource}/${id}`;
    },

    mapResponse: async (response) => {
      if (!response.ok) throw await buildHttpError(response);
      const json = (await response.json()) as { data: unknown };
      return json.data;
    },
  },

  create: {
    getEndpoint: ({ resource }) => {
      if (resource in RESOURCE_KIND_MAP) return "api/items";
      return `api/${resource}`;
    },

    buildBodyParams: async ({ variables, resource }) => {
      const kind = RESOURCE_KIND_MAP[resource];
      if (kind) return { ...variables, kind };
      return variables;
    },

    mapResponse: async (response) => {
      const json: CreateResponse = await response.json();

      return json.data ?? [];
    },
  },
};

export const { dataProvider } = createDataProvider(BACKEND_BASE_URL, options);
