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

const options: CreateDataProviderOptions = {
  getList: {
    getEndpoint: ({ resource }) => `api/${resource}`,

    buildQueryParams: async ({ resource, pagination, filters }) => {
      const page = pagination?.currentPage ?? 1;
      const pageSize = pagination?.pageSize ?? 10;

      const params: Record<string, string | number> = {
        page,
        limit: pageSize,
      };

      filters?.forEach((filter) => {
        const field = "field" in filter ? filter.field : "";
        const value = String(filter.value);

        if (resource === "components") {
          if (field === "name") params.search = value;

          if (field === "stack") params.stack = value;
          if (field === "categoryId") params.categoryId = value;
          if (field === "library") params.library = value;
          if (field === "language") params.language = value;
        }

        if (resource === "collections") {
          if (field === "name") params.search = value;

          if (field === "stack") params.stack = value;
          if (field === "categoryId") params.categoryId = value;
          if (field === "library") params.library = value;
        }

        if (resource === "snippets") {
          if (field === "name") params.search = value;

          if (field === "categoryId") params.categoryId = value;
          if (field === "type") params.type = value;
          if (field === "complexity") params.complexity = value;
        }

        if (resource === "categories") {
          if (field === "name") params.search = value;
        }
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
    getEndpoint: ({ resource, id }) => `api/${resource}/${id}`,

    mapResponse: async (response) => {
      if (!response.ok) throw await buildHttpError(response);
      const json = (await response.json()) as { data: unknown };
      return json.data;
    },
  },

  create: {
    getEndpoint: ({ resource }) => `api/${resource}`,

    buildBodyParams: async ({ variables }) => variables,

    mapResponse: async (response) => {
      const json: CreateResponse = await response.json();

      return json.data ?? [];
    },
  },
};

export const { dataProvider } = createDataProvider(BACKEND_BASE_URL, options);
