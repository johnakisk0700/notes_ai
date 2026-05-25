import { logger } from "./logger.js";
import Decimal from "decimal.js";
import { redis } from "clients/redis_client";
import { ecbConversionRatesTable } from "@shared/db/schema/ecbConversionRates";
import { eq, and } from "drizzle-orm";
import { drizzlePg } from "clients/drizzle_postgres_client.js";

Decimal.set({ precision: 15 }); // enough to handle 10 decimals safely

export async function getLatestUsdToEurRate() {
  const url =
    "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&lastNObservations=1";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ECB API request failed: ${response.status}`);
  }

  const data = await response.json();

  // Extract the series
  const seriesKey = Object.keys(data.dataSets[0].series)[0];
  const series = data.dataSets[0].series[seriesKey];

  // Extract the first observation
  const obsKey = Object.keys(series.observations)[0];
  const observation = series.observations[obsKey];

  // Get the rate and the date
  const rate = observation[0];
  const date =
    data.structure.dimensions.observation[0].values[Number(obsKey)].id;

  // Upsert using Drizzle
  await drizzlePg
    .insert(ecbConversionRatesTable)
    .values({
      from: "USD",
      to: "EUR",
      rate: rate.toString(),
      rateDate: date,
    })
    .onConflictDoUpdate({
      target: [ecbConversionRatesTable.from, ecbConversionRatesTable.to],
      set: {
        rate: rate.toString(),
        rateDate: date,
        updated_at: new Date(),
      },
    });

  // Set
  redis.set("conversion_rate", rate.toFixed(10).toString());
  redis.set("conversion_date", date.toString());
  logger.info(
    `Updated ECB Conversion Rates. New rate for USD->EUR: [${rate}]-[${date}]`
  );

  // elevenLabs
  const elevenRate = await setApiRate("elevenlabs_conversion", 0.00014);
  logger.info(`ElevenLabs rate set to: [${elevenRate}]`);

  // google voice - chirp
  const googleRate = await setApiRate("googlevoice_neural_conversion", 0.00003);
  logger.info(`Google Voice Neural rate set to: [${googleRate}]`);
}

export async function initializeECBRates() {
  const res = await drizzlePg
    .select()
    .from(ecbConversionRatesTable)
    .where(
      and(
        eq(ecbConversionRatesTable.from, "USD"),
        eq(ecbConversionRatesTable.to, "EUR")
      )
    )
    .limit(1);

  if (!res || res.length === 0) {
    logger.info("No ECB Conversion Rates found. Attempting to fetch.");
    await getLatestUsdToEurRate();
  } else {
    const rate = res[0];
    logger.info(`ECB Conversion Rates loaded from database.`);
    logger.info(
      `EUR to USD = [${rate.rate}] - Official Rate Date: ${rate.rateDate}`
    );
    redis.set("conversion_rate", rate.rate);
    redis.set("conversion_date", rate.rateDate);

    // elevenLabs
    const elevenRate = await setApiRate("elevenlabs_conversion", 0.00014);
    logger.info(`ElevenLabs rate set to: [${elevenRate}]`);

    // google voice - chirp
    const googleRate = await setApiRate(
      "googlevoice_chirp_conversion",
      0.00003
    );
    logger.info(`Google Voice Chirp rate set to: [${googleRate}]`);
  }
}

/**
 * Converts a USD value to EUR with high precision.
 * @param usdValue The amount in USD.
 * @param usdToEurRate The USD to EUR exchange rate (e.g. 0.92).
 * @returns EUR value rounded to 10 decimal places.
 */
export async function usdToEur(usdValue: Decimal): Promise<Decimal> {
  const eurToUsdRate = await redis.get("conversion_rate");
  if (eurToUsdRate) {
    const rate = new Decimal(eurToUsdRate);
    const usdToEurRate = new Decimal(1).div(rate);
    return usdValue
      .times(usdToEurRate)
      .toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
  } else {
    logger.error(
      "Couldnt find conversion rate even though it was fine on startup? Anyways, I will use the default 1.25 for now..."
    );
    return usdValue.times(1.25).toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
  }
}

export async function setApiRate(redisKey, rate) {
  const creatorRate = new Decimal(rate);
  const creatorRateEur = await usdToEur(creatorRate);
  await redis.set(redisKey, creatorRateEur.toFixed(10));
  return creatorRateEur;
}
