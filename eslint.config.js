export default [
  {
    ignores: [
      "node_modules/**",
      "public/**/*.min.js",
      "public/**/vendor/**"
    ]
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        alert: "readonly",
        confirm: "readonly",
        setTimeout: "readonly",
        URLSearchParams: "readonly",
        FileReader: "readonly",
        QRCode: "readonly",
        XLSX: "readonly",
        jsPDF: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "no-console": "off"
    }
  }
];
