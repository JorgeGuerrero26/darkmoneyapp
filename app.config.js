/* eslint-disable @typescript-eslint/no-require-imports */
const appJson = require("./app.json");

/**
 * Universal Links / App Links: define EXPO_PUBLIC_UNIVERSAL_LINK_HOST (solo hostname, sin https).
 * En el servidor publicar AASA + assetlinks.json para ese dominio y path /share/obligations/*
 */
module.exports = () => {
  const expo = { ...appJson.expo };
  const host = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST?.trim();

  if (host) {
    expo.ios = {
      ...expo.ios,
      associatedDomains: [...(expo.ios?.associatedDomains ?? []), `applinks:${host}`],
    };

    const obligationInviteFilter = {
      action: "VIEW",
      autoVerify: true,
      data: [
        {
          scheme: "https",
          host,
          pathPrefix: "/share/obligations",
        },
      ],
      category: ["BROWSABLE", "DEFAULT"],
    };

    expo.android = {
      ...expo.android,
      intentFilters: [...(expo.android?.intentFilters ?? []), obligationInviteFilter],
    };
  }

  return { expo };
};
