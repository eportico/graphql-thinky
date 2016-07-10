import thinkySchema from 'thinky-export-schema';
import _ from 'lodash';

/**
 * Args to find options
 *
 * @param args
 * @param model
 * @param opts
 * @returns {{}}
 */
export function argsToFindOptions(args, model, opts = {maxLimit: 50}) {
  const result = {
      filter: {},
      limit: undefined,
      skip: undefined,
      order: undefined
    },
    modelSchema = thinkySchema(model),
    attributes = Object.keys(modelSchema.fields).concat('id');

  opts.maxLimit = (opts.maxLimit === undefined) ? false : parseInt(opts.maxLimit, 10);

  if (args) {
    Object.keys(args).forEach(key => {
      if (attributes.indexOf(key) !== -1) {
        result.filter = result.filter || {};
        result.filter[key] = args[key];
      }

      // Limit arg
      if (key === 'limit' && args[key]) {
        result.limit = parseInt(args[key], 10);
      }

      if (key === 'skip' && args[key]) {
        result.skip = parseInt(args[key], 10);
      }

      if (key === 'order' && args[key]) {
        if (args[key].indexOf('reverse:') === 0) {
          result.order = [args[key].substring(8), 'DESC'];
        } else {
          result.order = [args[key], 'ASC'];
        }
      }
    });

    const maxLimit = opts.maxLimit;

    if (maxLimit) {
      if (!result.limit) {
        result.limit = maxLimit;
      }

      if (result.limit > maxLimit) {
        result.limit = maxLimit;
      }
    }

    return result;
  }
}

/**
 * Resolve join for nested relations
 * recursivily
 *
 * @param thinky
 * @param node
 * @returns {*}
 */
export function resolveJoin(thinky, node) {
  if (!node.related) {
    return;
  }

  const {model, type} = node.related;
  const {attributes} = node.args;

  const resolvedAttributes = {};
  const relationsResolved = {};
  const modelSchema = thinkySchema(model);

  Object.keys(node.tree).forEach(relatedKey => {
    const resolvedJoin = resolveJoin( // ** Recursion
        thinky,
        node.tree[relatedKey]
    );

    if (resolvedJoin) {
      relationsResolved[relatedKey] = resolvedJoin;
    }
  });

  attributes.forEach(attribute => {
    if (!node.tree.hasOwnProperty(attribute)) {
      resolvedAttributes[attribute] = true;
    }
  });

  // Add the id
  resolvedAttributes.id = true;

  return {
    _apply: seq => {
      const findArgs = {
        ...node.args,
        attributes
      };

      const columns = {};

      for (const field in resolvedAttributes) {
        if (!modelSchema.relationships.hasOwnProperty(field)) {
          columns[field] = resolvedAttributes[field];
        }
      }

      // Special case with belongs to,
      // we can't chain any sequence, need to open a issue
      // on thinky ex: pluck can't be chained
      if (type === 'belongsTo') {
        findArgs.attributes = false;
        findArgs.order = false;
        findArgs.limit = false;
      } else {
        findArgs.attributes = columns;
      }

      return buildQuery(seq, findArgs, thinky);
    },
    ...relationsResolved
  };
}

/**
 * Build query
 *
 * @param seq
 * @param args
 * @param thinky
 * @param options
 * @returns {*}
 */
export function buildQuery(seq, args, thinky) {
  args.relations = args.relations || {};
  let Query = seq;

  // If "query" arg is not given, then
  // we run the default query composition
  if (typeof args.query !== 'function') {

    if (_.isArray(args.attributes)) {
      Query = seq.withFields(args.attributes);
    } else if (_.isObject(args.attributes)) {
      Query = seq.withFields(args.attributes);
    }

    if (args.filter && Object.keys(args.filter).length > 0) {
      Object.keys(args.filter).forEach(fieldName => {
        if (_.isFunction(args.filter[fieldName])) {
          Query = Query.filter(args.filter[fieldName]);
          delete args.filter[fieldName];
        }
      });

      Query = Query.filter(args.filter);
    }

    if (args.count) {
      const countQuery = Query.merge(() => {
        return {
          fullCount: Query._query.count()
        };
      });

      Query = countQuery;
    }

    if (args.order && args.order[1] === 'DESC') {
      Query = Query.orderBy(thinky.r.desc((args.order[0])));
    } else if (args.order && args.order[0]) {
      Query = Query.orderBy(args.order[0]);
    }

    if (args.offset) {
      Query = Query.skip(parseInt(args.offset, 10));
    }

    if (args.limit) {
      Query = Query.limit(parseInt(args.limit, 10));
    }
  } else {
    Query = args.query(seq,args,thinky);
  }

  const joinRelations = {};

  // Compose the object which will join
  // the results, recursively
  Object.keys(args.relations).forEach(relation => {
    // Extract requested fields for the nested relation
    const resolvedJoin = resolveJoin(
        thinky,
        args.relations[relation]
    );

    if (resolvedJoin) {
      joinRelations[relation] = resolvedJoin;
    }
  });

  if (Object.keys(joinRelations).length > 0) {
    Query = Query.getJoin(joinRelations);
  }

  return Query;
}
