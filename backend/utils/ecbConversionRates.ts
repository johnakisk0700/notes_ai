import { logger } from "./logger.js";
import Decimal from "decimal.js";
import { redis } from "clients/redis_client";
import { ecbConversionRatesTable } from "@shared/db/schema/ecbConversionRates";
import { eq, and } from "drizzle-orm";
import { drizzlePg } from "clients/drizzle_postgres_client.js";

Decimal.set({ precision: 15 }); // enough to handle 10 decimals safely

export async function getLatestUsdToEurRate() {
  const url = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&lastNObservations=1";

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
  const date = data.structure.dimensions.observation[0].values[Number(obsKey)].id;

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
  logger.info(`Updated ECB Conversion Rates. New rate for USD->EUR: [${rate}]-[${date}]`);
}

export async function initializeECBRates() {
  const res = await drizzlePg
    .select()
    .from(ecbConversionRatesTable)
    .where(and(eq(ecbConversionRatesTable.from, "USD"), eq(ecbConversionRatesTable.to, "EUR")))
    .limit(1);

  if (!res || res.length === 0) {
    logger.info("No ECB Conversion Rates found. Attempting to fetch.");
    await getLatestUsdToEurRate();
  } else {
    const rate = res[0];
    logger.info(`ECB Conversion Rates loaded from database.`);
    logger.info(`EUR to USD = [${rate.rate}] - Official Rate Date: ${rate.rateDate}`);
    redis.set("conversion_rate", rate.rate);
    redis.set("conversion_date", rate.rateDate);
  }
}

/**
 * EUR per 1 USD, derived from the cached ECB USD→EUR rate (stored as USD-per-EUR).
 * Lets a caller convert costs synchronously after a single await — e.g. the chat
 * cost-metadata callback, which can't be async. Falls back to ~0.92 if uncached.
 */
export async function getEurPerUsd(): Promise<Decimal> {
  const usdPerEur = await redis.get("conversion_rate");
  if (usdPerEur) return new Decimal(1).div(new Decimal(usdPerEur));
  return new Decimal(0.92);
}

/**
 * Converts a USD value to EUR with high precision, using the cached ECB rate
 * (falling back to ~0.92 EUR/USD when uncached — see getEurPerUsd).
 * @param usdValue The amount in USD.
 * @returns EUR value rounded to 10 decimal places.
 */
export async function usdToEur(usdValue: Decimal): Promise<Decimal> {
  const eurPerUsd = await getEurPerUsd();
  return usdValue.times(eurPerUsd).toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
}
