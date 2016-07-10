import assert from 'assert';
import {buildQuery} from './queryBuilder';
import {resolveConnection} from './relay';

/**
 * Node class
 */
class Node {

  constructor({model, tree = {}, related = undefined, args = {}, connection = {}, name = '', query = undefined}) {
    assert(model, 'You need to provide a thinky Model');

    this.model = model;
    this.related = related;
    this.tree = tree;
    this.args = args;
    this.connection = connection;
    this.name = name; // The name will be populated based to AST name if not provided
    this.query = query;
  }

  /**
   * Resolve node based
   * a rethinkDB query
   *
   * @param thinky
   * @returns {*}
   */
  async queryResolve(thinky) {
    this.args.relations = this.tree;
    this.args.query = this.query;
    const Query = buildQuery(this.model, this.args, thinky);

    let queryResult;

    if (this.args.list) {
      queryResult = await Query.run();
    } else {
      queryResult = await Query.nth(0).default(null).run();
    }

    return queryResult;
  }

  /**
   * Resolve from tree
   *
   * @param source
   * @returns {*}
   */
  async resolve(source) {
    const result = source[this.name];

    return result;
  }

  /**
   * Create a relay connection
   *
   * @returns {{connectionType, edgeType, nodeType, resolveEdge, connectionArgs, resolve}|*}
   */
  connect() {
    /*eslint-disable */
    if (!this.connection.name) throw new Error("Please specify a connection name, before call connect on a Node");
    if (!this.connection.type) throw new Error("Please specify a connection type, before call connect on a Node");
    /*eslint-enable */

    return resolveConnection(this);
  }

  /**
   * Generate data tree
   *
   * @param treeSource
   * @param thinky
   * @returns {Array}
   */
  async generateDataTree(treeSource, thinky) {
    if (!this.isRelated()) {
      treeSource = await this.queryResolve(thinky);
    } else if (this.isRelated() && treeSource) {
      treeSource = await this.resolve(treeSource);
    }

    return treeSource;
  }

  /**
   * Set Relation Tree.
   * the three is an array of nodes
   *
   * @param tree array
   */
  setTree(tree) {
    this.tree = tree;
  }

  /**
   * Append Nodes to tree
   *
   * @param Node
   */
  appendToTree(Node) {
    this.tree = {...this.tree, ...Node};
  }

  /**
   * Return the depth level
   * of the tree
   *
   * @param object
   * @param level
   * @returns {*|number}
   */
  depthOfTree(object, level) {
    // Returns an int of the deepest level of an object
    level = level || 1;
    object = object || this.tree;

    let key;
    for (key in object) {
      if (!(object[key] instanceof Node)) {
        continue;
      }

      const nodeTree = object[key].getTree();
      if (Object.keys(nodeTree).length > 0) {
        level++;
        level = this.depthOfTree(nodeTree, level);
      }
    }

    return level;
  }

  /**
   * Get tree
   *
   * @returns {*}
   */
  getTree() {
    return this.tree;
  }

  /**
   * Append args
   *
   * @param args
   */
  appendArgs(args) {
    this.args = {...this.args, ...args};
  }

  /**
   * Determine if this node is a connection
   *
   * @returns {string|*}
   */
  isConnection() {
    return (this.connection.name && this.connection.type);
  }

  /**
   * Determine if the node is related
   *
   * @returns {boolean}
   */
  isRelated() {
    return Boolean(this.related);
  }

  /**
   * Get model of the Node
   *
   * @returns {*}
   */
  getModel() {
    return this.model;
  }

  /**
   * Get model Name
   *
   * @return {string}
   */
  getModelName() {
    return this.model.getTableName();
  }
}

export default Node;
