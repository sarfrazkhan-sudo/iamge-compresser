# iamge compresser

A client-side image compressor built with React and Vite. Images are processed in the browser and are never uploaded.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`.

## Use

Drop or browse for JPEG, PNG, or WebP images. Choose an output format and quality; the preview, file sizes, and savings update automatically. Download one image or bundle all completed images into a ZIP archive.

## Browser support

Compression uses the Canvas API and `createImageBitmap`. Export support depends on the browser; unsupported formats display an error instead of silently changing the requested format.
