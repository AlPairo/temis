export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.endsWith(".js")) {
      const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
}
