use anchor_lang::prelude::*;
use crate::{state::Policy, errors::SeatBackError as E};
pub const OPEN: u8 = 1;
pub const CANCELLED: u8 = 2;
pub const CLOSED: u8 = 3;
pub const RESERVED: u8 = 0;
pub const ATTENDED: u8 = 1;
pub const RES_CANCELLED: u8 = 2;
pub const NO_SHOW: u8 = 3;
pub const DISPUTED: u8 = 4;
pub const SETTLED: u8 = 5;
pub const DAY: i64 = 86_400;

pub fn validate_policy(p: &Policy, now: i64) -> Result<()> {
    require!(p.deposit_lamports > 0 && p.dispute_seconds == DAY as u32 &&
        now >= 0 && now < p.rule1_deadline &&
        p.rule1_deadline < p.rule2_deadline &&
        p.rule2_deadline <= p.check_in_opens_at &&
        p.check_in_opens_at <= p.event_starts_at &&
        p.event_starts_at < p.check_in_closes_at &&
        p.check_in_closes_at <= p.event_ends_at, E::InvalidPolicy);
    cutoff(p)?;
    Ok(())
}
pub fn cutoff(p: &Policy) -> Result<i64> {
    Ok(p.event_ends_at.max(p.check_in_closes_at.checked_add(DAY).ok_or(E::Overflow)?))
}
pub fn refund(p: &Policy, now: i64) -> u64 {
    if now < p.rule1_deadline { p.deposit_lamports }
    else if now < p.rule2_deadline { ((p.deposit_lamports as u128) * 30 / 100) as u64 }
    else { 0 }
}
pub fn add(a: u64, b: u64) -> Result<u64> { a.checked_add(b).ok_or_else(|| error!(E::Overflow)) }
pub fn sub(a: u64, b: u64) -> Result<u64> { a.checked_sub(b).ok_or_else(|| error!(E::Overflow)) }
pub fn inc(a: u32) -> Result<u32> { a.checked_add(1).ok_or_else(|| error!(E::Overflow)) }
pub fn dec(a: u32) -> Result<u32> { a.checked_sub(1).ok_or_else(|| error!(E::Overflow)) }

#[cfg(test)]
mod tests {
    use super::*;
    fn policy() -> Policy {
        Policy { deposit_lamports: 101, rule1_deadline: 10, rule2_deadline: 20,
            check_in_opens_at: 30, event_starts_at: 40, check_in_closes_at: 50,
            event_ends_at: 60, dispute_seconds: 86400 }
    }
    #[test]
    fn boundaries_and_conservation() {
        let p = policy();
        assert_eq!(refund(&p, 9), 101);
        assert_eq!(refund(&p, 10), 30);
        assert_eq!(refund(&p, 19), 30);
        assert_eq!(refund(&p, 20), 0);
        let mut p = p;
        for n in [1, 2, 99, 101, u64::MAX] {
            p.deposit_lamports = n;
            let r = refund(&p, 15);
            assert_eq!(add(r, sub(n, r).unwrap()).unwrap(), n);
        }
    }
    #[test]
    fn policy_and_overflow() {
        let mut p = policy();
        validate_policy(&p, 0).unwrap();
        assert_eq!(cutoff(&p).unwrap(), 86450);
        p.rule2_deadline = 10;
        assert!(validate_policy(&p, 0).is_err());
        assert!(add(u64::MAX, 1).is_err());
        assert!(sub(0, 1).is_err());
        p.check_in_closes_at = i64::MAX;
        assert!(cutoff(&p).is_err());
    }
}
