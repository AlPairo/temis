import type { PropsWithChildren, ReactElement } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions as RTLRenderOptions
} from "@testing-library/react";
import { createTestQueryClient } from "./query-client";

type ProviderOptions = {
  queryClient?: QueryClient;
  route?: string;
  withRouter?: boolean;
};

type ExtendedRenderOptions = Omit<RTLRenderOptions, "wrapper"> & ProviderOptions;

function createWrapper(options?: ProviderOptions) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const withRouter = options?.withRouter ?? true;
  const route = options?.route ?? "/";

  const Wrapper = ({ children }: PropsWithChildren) => {
    const content = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return withRouter ? <MemoryRouter initialEntries={[route]}>{content}</MemoryRouter> : content;
  };

  return { Wrapper, queryClient };
}

export function renderWithProviders(ui: ReactElement, options?: ExtendedRenderOptions) {
  const { Wrapper, queryClient } = createWrapper(options);
  const { queryClient: _queryClient, route: _route, withRouter: _withRouter, ...renderOptions } = options ?? {};
  return {
    queryClient,
    ...render(ui, {
      wrapper: Wrapper,
      ...renderOptions
    })
  };
}

type ExtendedRenderHookOptions<Props> = Omit<RenderHookOptions<Props>, "wrapper"> & ProviderOptions;

export function renderHookWithProviders<Result, Props>(
  renderCallback: (initialProps: Props) => Result,
  options?: ExtendedRenderHookOptions<Props>
) {
  const { Wrapper, queryClient } = createWrapper(options);
  const { queryClient: _queryClient, route: _route, withRouter: _withRouter, ...hookOptions } = options ?? {};
  return {
    queryClient,
    ...renderHook(renderCallback, {
      wrapper: Wrapper,
      ...hookOptions
    })
  };
}
