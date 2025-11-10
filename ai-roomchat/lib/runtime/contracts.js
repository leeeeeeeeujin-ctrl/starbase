/**
 * Runtime Contracts for Prompt-Graph based games.
 * These are documentation-only typedefs to align editor and runtime.
 */

/**
 * @typedef {{ id: string, type?: 'ai'|'user_action'|'system', label?: string }} GraphNode
 * @typedef {{ id?: string, source: string, target: string, label?: string }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} Graph
 */

/**
 * @typedef {Object} HookContext
 * @property {number} turn
 * @property {string} activeRole
 * @property {Record<string, any>} variables
 * @property {GraphNode|null} node
 * @property {Record<string, { content: string, readonly?: boolean }>} files
 */

/**
 * @callback OnTurnStart
 * @param {HookContext} ctx
 * @returns {void|Promise<void>}
 */

/**
 * @callback TransformPrompt
 * @param {HookContext} ctx
 * @returns {string|{ prompt: string, ui?: any }|Promise<string|{ prompt: string, ui?: any }>}
 */

/**
 * @callback OnUserAction
 * @param {HookContext} ctx
 * @param {any} input
 * @returns {void|string|{ next?: string }|Promise<void|string|{ next?: string }>}
 */

/**
 * @callback SelectNext
 * @param {HookContext} ctx
 * @param {{ id:string, label?:string, type?:string }[]} neighbors
 * @returns {string|null|Promise<string|null>}
 */

/**
 * @typedef {{ onTurnStart?: OnTurnStart, transformPrompt?: TransformPrompt, onUserAction?: OnUserAction, selectNext?: SelectNext }} GameHooks
 */

export {}; // typing-only module

