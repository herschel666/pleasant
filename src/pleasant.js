const REGEXP_RGBA_VALUE = /^rgba?\((\d{1,3}),\s?(\d{1,3}),\s?(\d{1,3})(?:,\s?([0-9.]+))?\)$/;

const REGEXP_RGBA_COLOR = /(rgba?\([^)]+\))/g;

const REGEXP_CSS_VAR = /^(var\([^,)]+.*\))$/;

const REGEXP_CSS_VAR_VALUE = /^var\(([^,)]+).*\)$/;

const isValidColorValue = (prop, value) =>
  Boolean(prop.match(/color/i)) &&
  value !== 'inherit' &&
  value !== 'initial' &&
  value !== 'unset' &&
  value !== 'transparent' &&
  value !== 'currentcolor' &&
  value.indexOf('url(') === -1;

const isValidShadowValue = (prop, value) =>
  Boolean(prop.match(/shadow/i)) &&
  value !== 'none' &&
  value !== 'initial' &&
  value !== 'unset';

const getRgbFromArbitraryColorValue = (str) =>
  new Promise((resolve) => {
    const elem = document.createElement('span');

    elem.style.color = str;

    requestAnimationFrame(() => {
      document.body.appendChild(elem);
      const color = window.getComputedStyle(elem).color;

      requestAnimationFrame(() => {
        document.body.removeChild(elem);
        resolve(color);
      });
    });
  });

const getRgbValueFromVariable = async (variable) => {
  const [, value] = variable.match(REGEXP_CSS_VAR_VALUE) || [];

  if (!value) {
    return null;
  }

  return getRgbFromArbitraryColorValue(
    getComputedStyle(document.documentElement).getPropertyValue(value)
  );
};

const getRgbaValues = async (style, prop, str = style[prop]) => {
  const color =
    str.indexOf('rgb') === 0
      ? str
      : str.indexOf('var(') === 0
      ? await getRgbValueFromVariable(str.trim())
      : await getRgbFromArbitraryColorValue(str.trim());

  try {
    if (!color) {
      throw new Error(`"color" is null. (${str})`);
    }

    const [, r, g, b, a = '1'] = color.match(REGEXP_RGBA_VALUE);

    if (!r || !g || !b) {
      return [style, prop, null];
    }

    const rgbaValues = [Number(r), Number(g), Number(b), parseFloat(a, 10)];

    return [style, prop, rgbaValues];
  } catch (err) {
    console.log(err);
    return [style, prop, null];
  }
};

const getGrayscale = ([r, g, b, a]) => {
  const intensity = 0.3 * r + 0.59 * g + 0.11 * b;
  const k = 1;
  const gr = Math.floor(intensity * k + r * (1 - k));
  const gg = Math.floor(intensity * k + g * (1 - k));
  const gb = Math.floor(intensity * k + b * (1 - k));

  return `rgba(${gr}, ${gg}, ${gb}, ${a})`;
};

const pleasantify = () => {
  try {
    Array.from(document.styleSheets).forEach((sheet) => {
      const { origin } = new URL(sheet.href || location.href);

      if (origin !== location.origin) {
        return;
      }

      Array.from(sheet.cssRules).forEach((rule) => {
        if (!rule.style) {
          return;
        }

        for (prop of rule.style) {
          if (!rule.style[prop]) {
            continue;
          }

          if (isValidColorValue(prop, rule.style[prop].toLowerCase())) {
            getRgbaValues(rule.style, prop).then(
              ([style, prop, rgbaValues]) => {
                if (!rgbaValues) {
                  return;
                }

                style[prop] = getGrayscale(rgbaValues);
              }
            );
          }

          if (isValidShadowValue(prop, rule.style[prop].toLowerCase())) {
            const colors =
              rule.style[prop].match(REGEXP_RGBA_COLOR) ||
              rule.style[prop].match(REGEXP_CSS_VAR) ||
              [];

            colors
              .reduce(async (p, color) => {
                const acc = await p;
                const [, , rgbaValues] = await getRgbaValues(
                  acc.style,
                  acc.prop,
                  color
                );

                if (!rgbaValues) {
                  return acc;
                }

                acc.colors[color] = getGrayscale(rgbaValues);
                return acc;
              }, Promise.resolve({ prop, style: rule.style, colors: Object.create(null) }))
              .then(({ prop, style, colors: colorMap }) => {
                try {
                  Object.entries(colorMap).forEach(([indeterminate, color]) => {
                    style[prop] = style[prop].replace(indeterminate, color);
                  });
                } catch (err) {}
              });
          }

          if (rule.style[prop].indexOf('url(') > -1) {
            const filter = (rule.style.filter || '')
              .split(' ')
              .filter(
                (filterProp) =>
                  filterProp && filterProp.indexOf('grayscale') === -1
              )
              .concat('grayscale(100%)');

            rule.style.filter = filter.join(' ');
          }
        }
      });
    });
  } catch (e) {
    console.error(e);
  }
};

const init = () => {
  requestAnimationFrame(pleasantify);
  setTimeout(init, 200);
};

document.head.appendChild(
  Object.assign(document.createElement('style'), {
    type: 'text/css',
    textContent: `
img, svg, object, canvas, video, select,
input, [style*="url("] {
  filter: grayscale(100%) !important;
}`,
  })
);

init();
