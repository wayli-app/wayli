// web/src/lib/services/queue/helpers/date-ranges.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as workerSupabase } from '$lib/core/supabase/worker';

export async function findAvailableDateRanges(
  userId: string,
  userStartDate?: string,
  userEndDate?: string,
  client?: SupabaseClient
): Promise<Array<{ startDate: string; endDate: string }>> {
  const supabase = client ?? workerSupabase;
  try {
    console.log('🔍 Finding available date ranges for trip generation...');
    console.log(`👤 User ID: ${userId}`);
    if (userStartDate) console.log(`📅 User specified start date: ${userStartDate}`);
    if (userEndDate) console.log(`📅 User specified end date: ${userEndDate}`);

    const { data: earliestData, error: earliestError } = await supabase
      .from('tracker_data')
      .select('recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: true })
      .limit(1);

    const { data: latestData, error: latestError } = await supabase
      .from('tracker_data')
      .select('recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(1);

    if (earliestError || latestError) {
      console.error('❌ Error fetching tracker data date range:', earliestError || latestError);
      return [];
    }

    if (!earliestData || earliestData.length === 0 || !latestData || latestData.length === 0) {
      console.log('❌ No tracker data found for user');
      return [];
    }

    const dataEarliestDate = new Date(earliestData[0].recorded_at).toISOString().split('T')[0];
    const dataLatestDate = new Date(latestData[0].recorded_at).toISOString().split('T')[0];

    console.log(`📅 Full data range from tracker data: ${dataEarliestDate} to ${dataLatestDate}`);

    let earliestDate = dataEarliestDate;
    let latestDate = dataLatestDate;

    if (userStartDate) {
      const userStart = new Date(userStartDate);
      const dataStart = new Date(dataEarliestDate);
      if (userStart > dataStart) {
        earliestDate = userStartDate;
        console.log(`📅 Applied user start date constraint: earliest date now ${earliestDate}`);
      } else {
        console.log(`📅 User start date ${userStartDate} is before or equal to data start date ${dataEarliestDate}, using data start date`);
      }
    }

    if (userEndDate) {
      const userEnd = new Date(userEndDate);
      const dataEnd = new Date(dataLatestDate);
      if (userEnd < dataEnd) {
        latestDate = userEndDate;
        console.log(`📅 Applied user end date constraint: latest date now ${latestDate}`);
      } else {
        console.log(`📅 User end date ${userEndDate} is after or equal to data end date ${dataLatestDate}, using data end date`);
      }
    }

    console.log(`📅 Effective search range (after applying user constraints): ${earliestDate} to ${latestDate}`);

    const { data: existingTrips, error: tripsError } = await supabase
      .from('trips')
      .select('start_date, end_date')
      .eq('user_id', userId)
      .in('status', ['active', 'completed', 'rejected', 'pending']);

    if (tripsError) {
      console.error('❌ Error fetching existing trips:', tripsError);
      return [];
    }

    console.log('📋 Found existing trips:', existingTrips?.length || 0);
    if (existingTrips && existingTrips.length > 0) {
      console.log('📋 Existing trips details:');
      existingTrips.forEach((trip, index) => {
        console.log(`  Trip ${index + 1}: ${trip.start_date} to ${trip.end_date}`);
      });
    }

    const excludedDates = new Set<string>();
    let tripsDatesAdded = 0;
    existingTrips?.forEach((trip) => {
      const start = new Date(trip.start_date);
      const end = new Date(trip.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        excludedDates.add(d.toISOString().split('T')[0]);
        tripsDatesAdded++;
      }
    });

    console.log('📅 Excluded dates count:', excludedDates.size);
    console.log('📅 Dates added from existing trips:', tripsDatesAdded);

    const effectiveStartDate = new Date(earliestDate);
    const effectiveEndDate = new Date(latestDate);
    const availableRanges: Array<{ startDate: string; endDate: string }> = [];

    console.log('🔍 Finding available date ranges by excluding existing trip dates...');
    let currentRangeStart: string | null = null;
    for (let d = new Date(effectiveStartDate); d <= effectiveEndDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const isExcluded = excludedDates.has(dateStr);
      if (!isExcluded && currentRangeStart === null) {
        currentRangeStart = dateStr;
      } else if (isExcluded && currentRangeStart !== null) {
        const rangeEnd = new Date(d.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        availableRanges.push({ startDate: currentRangeStart, endDate: rangeEnd });
        currentRangeStart = null;
      }
    }
    if (currentRangeStart !== null) {
      availableRanges.push({ startDate: currentRangeStart, endDate: latestDate });
    }

    console.log(`📊 Found ${availableRanges.length} initial available ranges before filtering`);
    const filteredRanges = availableRanges.filter((range) => {
      const start = new Date(range.startDate);
      const end = new Date(range.endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      if (daysDiff < 2) {
        console.log(`❌ Filtering out range ${range.startDate} to ${range.endDate}: too short (${daysDiff} days < 2)`);
        return false;
      }
      console.log(`✅ Keeping range ${range.startDate} to ${range.endDate} (${daysDiff} days)`);
      return true;
    });

    if (filteredRanges.length === 0) {
      console.log('❌ No available date ranges found after filtering (all ranges too short or all dates excluded)');
      return [];
    }

    console.log(`🎯 Found ${filteredRanges.length} available date ranges for sleep-based trip detection`);
    return filteredRanges;
  } catch (error) {
    console.error('❌ Error finding available date ranges:', error);
    return [];
  }
}


