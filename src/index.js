import {writeFileSync, readFileSync} from 'fs';
import {resolve} from 'path';
import stringHash from 'string-hash';
import postcss from 'postcss';
import modules from 'postcss-modules';
import cssnanoCore from 'cssnano/lib/core';
import discardComments from 'postcss-discard-comments';
import minifyGradients from 'postcss-minify-gradients';
import reduceTransforms from 'postcss-reduce-transforms';
import autoprefixer from 'autoprefixer';
import convertValues from 'postcss-convert-values';
import calc from 'postcss-calc';
import colormin from 'postcss-colormin';
import orderedValues from 'postcss-ordered-values';
import minifySelectors from 'postcss-minify-selectors';
import minifyParams from 'postcss-minify-params';
import normalizeCharset from 'postcss-normalize-charset';
import minifyFontValues from 'postcss-minify-font-values';
import discardUnused from 'postcss-discard-unused';
import normalizeUrl from 'postcss-normalize-url';
import mergeIdents from 'postcss-merge-idents';
import mergeLonghand from 'postcss-merge-longhand';
import discardDuplicates from 'postcss-discard-duplicates';
import mergeRules from 'postcss-merge-rules';
import discardEmpty from 'postcss-discard-empty';
import uniqueSelectors from 'postcss-unique-selectors';

function postPlugins() {
  const plugins = [];

  plugins.push(discardComments());
  plugins.push(minifyGradients());
  plugins.push(reduceTransforms());
  // see https://github.com/ai/browserslist#queries
  plugins.push(autoprefixer({browsers: ['last 3 versions'], cascade: false}));
  plugins.push(convertValues({length: false}));
  plugins.push(calc());
  plugins.push(colormin());
  plugins.push(orderedValues());
  plugins.push(minifySelectors());
  plugins.push(minifyParams());
  plugins.push(normalizeCharset({add: false}));
  // minify-font-values should be run before discard-unused
  plugins.push(minifyFontValues());
  plugins.push(discardUnused());
  plugins.push(normalizeUrl);
  plugins.push(cssnanoCore());
  // Optimisations after this are sensitive to previous optimisations in
  // the pipe, such as whitespace normalising/selector re-ordering
  plugins.push(mergeIdents());
  plugins.push(mergeLonghand());
  plugins.push(discardDuplicates());
  plugins.push(mergeRules());
  plugins.push(discardEmpty());
  plugins.push(uniqueSelectors());

  return plugins;
}

export default function ({types: t}) {
  const compressedClassesCache = {maxID: 0};
  const cssSources = {};
  const aliases = {};

  function isCall(node) {
    return (
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee, {name: 'css'}) &&
      node.arguments.length === 1
    );
  }
  function isTagged(node) {
    return (
      t.isTaggedTemplateExpression(node) &&
      t.isIdentifier(node.tag, {name: 'css'})
    );
  }

  function getInputAndTag(path) {
    if (isCall(path.node)) {
      const {confident, value} = path.get('arguments')[0].evaluate();
      if (!confident || typeof value !== 'string') {
        throw new Error('Expected a constant string as the input to `insert-css-module`');
      }
      return {input: value, tag: path.node.callee, match: true};
    } else if (isTagged(path.node)) {
      const {confident, value} = path.get('quasi').evaluate();
      if (!confident || typeof value !== 'string') {
        throw new Error('Expected a constant string as the input to `insert-css-module`');
      }
      return {input: value, tag: path.node.tag, match: true};
    } else {
      return {input: null, tag: null, match: false};
    }
  }
  function visitVariableDeclaration(path, opts, filename) {
    if (
      t.isVariableDeclaration(path.node, {kind: 'const'}) &&
      path.node.declarations.length === 1 &&
      path.node.declarations[0].init
    ) {
      const {input, tag, match} = getInputAndTag(path.get('declarations')[0].get('init'));
      if (!match) {
        return;
      }

      const processor = postcss([
        modules({
          getJSON(cssFileName, json) {
            aliases[path.node.declarations[0].id.name] = json;
          },
          generateScopedName(name, filename, css) {
            filename = resolve(filename);
            if (opts.optimised) {
              const key = stringHash(filename).toString(36) + '_' + stringHash(name).toString(36);
              let id;
              let cache = compressedClassesCache;
              if (opts.cache) {
                try {
                  cache = JSON.parse(readFileSync(opts.cache, 'utf8'));
                } catch (ex) {
                  if (ex.code === 'ENOENT') cache = {maxID: 0};
                  else throw ex;
                }
              }
              if (key in cache) {
                id = cache[key];
              } else {
                id = cache.maxID++;
                cache[key] = id;
              }
              if (opts.cache) {
                writeFileSync(opts.cache, JSON.stringify(cache, null, '  '));
              }
              return '_' + (opts.optimised === true ? id : opts.optimised + '_' + id);
            }
            const i = css.indexOf('.' + name);
            const numLines = css.substr(0, i).split(/[\r\n]/).length;
            const hash = stringHash(css).toString(36);

            return `_${ name }_${ hash }_${ numLines }`;
          },
        }),
      ].concat(postPlugins()),
      );

      const transformedCSS = processor.process(input, {
        from: filename,
        to: filename,
      }).css;

      if (opts.extractCSS) {
        cssSources[opts.extractCSS][filename] += transformedCSS;
        path.remove();
      } else {
        path.replaceWith(
          t.expressionStatement(
            t.callExpression(
              tag,
              [
                t.stringLiteral(transformedCSS),
              ],
            ),
          ),
        );
      }
    }
  }

  function visitExpressionStatement(path, opts, filename) {
    if (t.isExpressionStatement(path.node)) {
      const {input, tag, match} = getInputAndTag(path.get('expression'));
      if (!match) return;

      const processor = postcss(postPlugins());

      const transformedCSS = processor.process(input, {
        from: filename,
        to: filename,
      }).css;
      if (opts.extractCSS) {
        cssSources[opts.extractCSS][filename] += input;
        path.remove();
      } else if (transformedCSS !== input) {
        path.replaceWith(
          t.expressionStatement(
            t.callExpression(
              tag,
              [
                t.stringLiteral(transformedCSS),
              ],
            ),
          ),
        );
      }
    }
  }

  return {
    visitor: {
      // NoOps to ensure correct ordering by babel
      TaggedTemplateExpression() {},
      TemplateLiteral() {},
      Program: {
        enter(path) {
          if (this.opts.extractCSS) {
            const filename = resolve(this.file.opts.filename);
            cssSources[this.opts.extractCSS] = cssSources[this.opts.extractCSS] || {};
            cssSources[this.opts.extractCSS][filename] = '';
          }
        },
        exit(path) {
          if (this.opts.extractCSS) {
            writeFileSync(
              this.opts.extractCSS,
              Object.keys(
                cssSources[this.opts.extractCSS]
              ).sort().map(filename => cssSources[this.opts.extractCSS][filename]).join('\n'),
            );
          }
        },
      },
      VariableDeclaration(path) {
        if (path.node._insertedCSS) return;
        const filename = resolve(this.file.opts.filename);
        visitVariableDeclaration(path, this.opts, filename);
        if (path.node) path.node._insertedCSS = true;
      },
      ExpressionStatement(path) {
        if (path.node._insertedCSS) return;
        const filename = resolve(this.file.opts.filename);
        visitExpressionStatement(path, this.opts, filename);
        if (path.node) path.node._insertedCSS = true;
      },
      CallExpression(path) {
        if (path.node._insertedCSS) return;
        if (
          t.isIdentifier(path.node.callee) &&
          (path.node.callee.name in aliases) &&
          path.node.arguments.length === 1
        ) {
          const {confident, value} = path.get('arguments')[0].evaluate();
          if (!confident || typeof value !== 'string') {
            throw new Error('Expected a constant string as the input to `insert-css-module`');
          }
          if (!(value in aliases[path.node.callee.name])) {
            throw new Error('Unrecognised class name "' + value + '"');
          }
          path.replaceWith(t.stringLiteral(aliases[path.node.callee.name][value]));
        }
        if (path.node) path.node._insertedCSS = true;
      },
    },
  };
}
