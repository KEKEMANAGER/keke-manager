/**
 * Compile-time fix: flatten JSX style arrays so React 19 web never assigns
 * arrays to CSSStyleDeclaration. Safe on all platforms (StyleSheet.flatten).
 */
module.exports = function flattenRnStylesPlugin({ types: t }) {
  const STYLE_PROPS = new Set(['style', 'contentContainerStyle']);

  function flattenArrayExpr(arrayNode) {
    return t.callExpression(
      t.memberExpression(t.identifier('StyleSheet'), t.identifier('flatten')),
      [arrayNode],
    );
  }

  function flattenArrayPath(arrayPath) {
    arrayPath.replaceWith(flattenArrayExpr(arrayPath.node));
    return true;
  }

  function flattenStyleExpression(exprPath) {
    if (exprPath.isArrayExpression()) {
      return flattenArrayPath(exprPath);
    }

    if (exprPath.isArrowFunctionExpression() || exprPath.isFunctionExpression()) {
      const body = exprPath.get('body');
      if (body.isArrayExpression()) {
        return flattenArrayPath(body);
      }
      if (body.isBlockStatement()) {
        let changed = false;
        body.traverse({
          ReturnStatement(ret) {
            const arg = ret.get('argument');
            if (arg.isArrayExpression() && flattenArrayPath(arg)) {
              changed = true;
            }
          },
        });
        return changed;
      }
    }

    return false;
  }

  return {
    name: 'flatten-rn-styles',
    visitor: {
      JSXAttribute(path, state) {
        const name = path.node.name.name;
        if (!STYLE_PROPS.has(name)) return;

        const value = path.get('value');
        if (!value.isJSXExpressionContainer()) return;

        if (flattenStyleExpression(value.get('expression'))) {
          state.needsStyleSheet = true;
        }
      },
      Program: {
        exit(path, state) {
          if (!state.needsStyleSheet) return;

          let hasStyleSheet = false;
          let rnImport = null;

          for (const node of path.node.body) {
            if (!t.isImportDeclaration(node) || node.source.value !== 'react-native') continue;
            rnImport = node;
            for (const spec of node.specifiers) {
              if (t.isImportSpecifier(spec) && spec.imported.name === 'StyleSheet') {
                hasStyleSheet = true;
              }
            }
          }

          if (hasStyleSheet) return;

          if (rnImport) {
            rnImport.specifiers.push(
              t.importSpecifier(t.identifier('StyleSheet'), t.identifier('StyleSheet')),
            );
          } else {
            path.unshiftContainer(
              'body',
              t.importDeclaration(
                [t.importSpecifier(t.identifier('StyleSheet'), t.identifier('StyleSheet'))],
                t.stringLiteral('react-native'),
              ),
            );
          }
        },
      },
    },
  };
};
