export const name = 'file-uploads-none';
export function apply(ctx) {
    ctx.provide('fileUploads', {
        registerAgentResolver: () => () => { },
        resolve: () => undefined,
        bindPrompt: () => ({ commit: () => { }, [Symbol.dispose]: () => { } }),
        retirePrompt: () => { },
    });
}
