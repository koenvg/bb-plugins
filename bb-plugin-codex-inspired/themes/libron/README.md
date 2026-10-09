# Libron font source

The theme embeds unmodified Regular and Bold WOFF2 files from [Libron v0.30](https://github.com/nicoverbruggen/libron/releases/tag/v0.30), archive `Libron_Web.zip`. Libron is by Nico Verbruggen, based on Readerly and Newsreader. Copyright and SIL Open Font License 1.1 are in `OFL.txt`.

Both faces are embedded as data URLs in `../codex-inspired.css` so all BB clients can read without a system font installation or a third-party request. BB limits theme CSS to 256,000 characters, so the theme ships two upright faces and browsers synthesize italic styling. Do not embed all four upstream faces; they exceed that limit.

Original file SHA256 values:

- `Libron-Regular.woff2`: `e64c8420f5d21deb3fce8d45a6d9165827067de8c36262922ad5f56e6b0c37f4`
- `Libron-Bold.woff2`: `2c904e1af5a98879e7ea11089d7e1812e13574658849b9b1518d438f9379b75e`

For a font update, replace the two data URL payloads with the new unmodified web files, update these checksums and the font tests, refresh the theme checksum in the README and package test, and include the upstream license. Keep the theme below BB's size limit.
