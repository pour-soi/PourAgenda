const fontFace = (family, fileName) => `
  @font-face {
    font-family: '${family}';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url(https://fonts.test/${fileName}.woff2) format('woff2');
  }
`;

module.exports = {
  "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap":
    fontFace("Geist", "geist"),
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap":
    fontFace("Geist Mono", "geist-mono"),
};
