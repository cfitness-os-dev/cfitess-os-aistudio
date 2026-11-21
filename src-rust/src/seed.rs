use crate::models::{
    AmbiguityRecord, AppDatabaseState, AuditEvent, ContractSummary, Employee, EmployeeCounter,
    EmployeeSiteAccess, LeadActivityRecord, LeadAppointmentRecord, LeadFormFieldRecord,
    LeadFormRecord, LeadFormSampleResponseRecord, LeadProspectRecord, LeaveRequest,
    NotificationPrefs, Organization, Position, RecoveryCaseRecord, RoleProfile, SensitiveBankInfo,
    Shift, Site, SiteHrSettings, SiteKpis, StockItemRecord, MaintenanceTicketRecord, Team, TimeclockAnomaly, UserPreferences,
};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

const PERMISSIONS_MATRIX_JSON: &str = include_str!("../data/permissions_matrix.json");
pub const REGISTRY_SUMMARY_JSON: &str = include_str!("../data/registry_summary.json");

fn default_preferences(lang: &str) -> UserPreferences {
    UserPreferences {
        language: lang.to_string(),
        notifications: NotificationPrefs {
            email_enabled: true,
            sms_enabled: false,
            frequency: "daily".to_string(),
            digest_hour: "08:30".to_string(),
            include_activity_report: false,
        },
        calendar_feed_token: "cal-demo-token-0000".to_string(),
        calendar_feed_enabled: true,
        sso_enabled: false,
        sso_provider: "OIDC / SAML (non activé)".to_string(),
        sso_domain: String::new(),
        theme_mode: "dark".to_string(),
        accent_color: "violet".to_string(),
    }
}

pub fn ambiguities_baseline() -> Vec<AmbiguityRecord> {
    vec![
        AmbiguityRecord {
            id: "AMB14-01".into(),
            title: "Compatibilité mobile".into(),
            description: "Versions OS minimales différentes entre l’accueil et l’article de téléchargement ; vérifier sur appareils réels.".into(),
            decision_status: "open".into(),
            resolution_note: "À valider sur parc iOS/Android du club avant Lot 5.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-02".into(),
            title: "Annualisation sur mobile".into(),
            description: "Distinction entre solde d’annualisation, écart cumulé et version d’application mobile.".into(),
            decision_status: "open".into(),
            resolution_note: "Conserver solde + écart cumulé séparés en base (OBJ22).".into(),
        },
        AmbiguityRecord {
            id: "AMB14-03".into(),
            title: "Absence acceptée et shifts en conflit".into(),
            description: "Maintien ou bascule automatique vers les shifts non assignés selon option et version.".into(),
            decision_status: "open".into(),
            resolution_note: "Paramètre explicite prévu au Lot 4 avant génération planning.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-04".into(),
            title: "Export des badges et feuille individuelle".into(),
            description: "Différence de colonnes, périodes et permissions entre téléchargement de badges et feuille individuelle.".into(),
            decision_status: "open".into(),
            resolution_note: "Schéma d’export versionné prévu aux Lots 5 & 6.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-05".into(),
            title: "Date de fin du contrat à l’avenant".into(),
            description: "Borne veille du début d’avenant vs date de début d’avenant à confirmer par la paie.".into(),
            decision_status: "open".into(),
            resolution_note: "Arbitrage paie requis avant Lot 3 (historisation OBJ08/OBJ09).".into(),
        },
        AmbiguityRecord {
            id: "AMB14-06".into(),
            title: "Nombre de droits administrateur (+53 vs 44 lignes)".into(),
            description: "La carte administrateur annonce 2 libellés + 53 autres (55) alors que le panneau détaillé expose 44 lignes canoniques.".into(),
            decision_status: "open".into(),
            resolution_note: "Ne pas inventer les 11 droits absents ; traçabilité conservée.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-07".into(),
            title: "Période du Pilotage (3 mois vs 13 mois)".into(),
            description: "L’aide indique 3 mois en introduction puis jusqu’à 13 mois sur un graphique.".into(),
            decision_status: "open".into(),
            resolution_note: "Bornes configurables par vue au Lot 8.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-08".into(),
            title: "Version des besoins automatiques".into(),
            description: "L’aide décrit 1 règle par poste (50/site) tandis que l’interface observée sépare besoins fixes et variables (PAR18).".into(),
            decision_status: "open".into(),
            resolution_note: "Conserver les deux représentations jusqu’à validation propriétaire.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-09".into(),
            title: "Plusieurs badgeuses tablette".into(),
            description: "Recommandation d’une tablette vs possibilité documentée de synchronisation multi-tablettes.".into(),
            decision_status: "open".into(),
            resolution_note: "Distinguer support matériel et règle métier au Lot 5.".into(),
        },
        AmbiguityRecord {
            id: "AMB14-10".into(),
            title: "Unités des formules de performance".into(),
            description: "Ambiguïté sur masse salariale chargée/brute, productivité et traitement du dénominateur nul ou donnée absente.".into(),
            decision_status: "open".into(),
            resolution_note: "Donnée absente (null) affichée distincte de zéro (TST24).".into(),
        },
    ]
}

fn default_lead_settings_by_club() -> HashMap<String, serde_json::Value> {
    let mut map = HashMap::new();
    map.insert(
        "carre-de-soie".to_string(),
        serde_json::json!({
            "smsCredits": 1420,
            "salesScript": "1. Accueil & objectif forme\n2. Découverte Biocircuit / Checkup\n3. Proposition créneau essai",
            "archiveThresholdDays": 30,
            "notifEmail": "direction@c.fitness",
            "notifMobile": "07 82 00 00 01",
            "whatsappNumber": "+33 4 78 00 00 01",
            "clientPassOffer": "Pass Liberté + Biocircuit 12 mois",
            "autoAssignEnabled": true,
            "autoUnassignOnLeave": true,
            "dropoutThresholdDays": 21,
            "dropoutResetOnBadge": true,
            "autoArchiveEnabled": true,
            "archiveTargetStage": "Archivé",
            "enabledAlertIds": ["LEAD-0545", "LEAD-0548", "LEAD-0551", "LEAD-0552"],
            "selectedPassOfferIds": ["HZ-CDS-ABO-PASS", "HZ-CDS-ABO-SOLO"],
            "clientPassTargetScope": "club",
            "uiLanguage": "fr"
        }),
    );
    map.insert(
        "beynost".to_string(),
        serde_json::json!({
            "smsCredits": 980,
            "salesScript": "1. Accueil & objectif forme\n2. Présentation espace fonctionnel & cours\n3. Proposition créneau essai",
            "archiveThresholdDays": 30,
            "notifEmail": "direction.beynost@c.fitness",
            "notifMobile": "07 82 00 00 02",
            "whatsappNumber": "+33 4 78 00 00 02",
            "clientPassOffer": "Pass Liberté Beynost 12 mois",
            "autoAssignEnabled": true,
            "autoUnassignOnLeave": true,
            "dropoutThresholdDays": 21,
            "dropoutResetOnBadge": true,
            "autoArchiveEnabled": true,
            "archiveTargetStage": "Archivé",
            "enabledAlertIds": ["LEAD-0545", "LEAD-0548", "LEAD-0551", "LEAD-0552"],
            "selectedPassOfferIds": ["HZ-BEY-ABO-PASS", "HZ-BEY-ABO-SOLO"],
            "clientPassTargetScope": "club",
            "uiLanguage": "fr"
        }),
    );
    map
}

fn default_sites(fictive_labels: bool) -> Vec<Site> {
    vec![
        Site {
            id: "club-carre-soie".into(),
            name: if fictive_labels {
                "C.Fitness Carré de Soie (Fictif)".into()
            } else {
                "C.Fitness Carré de Soie".into()
            },
            address: if fictive_labels {
                "10 Avenue Fictive du Club".into()
            } else {
                String::new()
            },
            city: if fictive_labels {
                "Vaulx-en-Velin (Fictif)".into()
            } else {
                "Vaulx-en-Velin".into()
            },
            timezone: "Europe/Paris".into(),
            siret: if fictive_labels {
                "99900011100019".into()
            } else {
                String::new()
            },
            settings: SiteHrSettings {
                badge_frequency: "each_shift".into(),
                tablet_break_badging: true,
                day_start_hour: "06:00".into(),
                break_alert_hours: 4,
                break_alert_enabled: true,
                consecutive_days_blocking: true,
                complementary_max_hours: 39,
                smart_planner_break_max_hours: 4,
                alerts_layout: "split_13_6".into(),
                missions_module_active: false,
                report_rules_visible: true,
                annualization_period: "01 juin 2026 - 31 mai 2027".into(),
                acquisition_mode: "jours_ouvrables".into(),
                annualization_total_motives: 42,
                annualization_included_motives: 31,
                sunday_hours_in_annualization: true,
                rtt_hours_counter_active: false,
            },
        },
        Site {
            id: "club-beynost".into(),
            name: if fictive_labels {
                "C.Fitness Beynost (Fictif)".into()
            } else {
                "C.Fitness Beynost".into()
            },
            address: if fictive_labels {
                "25 Rue Fictive des Sports".into()
            } else {
                String::new()
            },
            city: if fictive_labels {
                "Beynost (Fictif)".into()
            } else {
                "Beynost".into()
            },
            timezone: "Europe/Paris".into(),
            siret: if fictive_labels {
                "99900011100027".into()
            } else {
                String::new()
            },
            settings: SiteHrSettings {
                badge_frequency: "consecutive_shift_series".into(),
                tablet_break_badging: false,
                day_start_hour: "05:00".into(),
                break_alert_hours: 2,
                break_alert_enabled: false,
                consecutive_days_blocking: false,
                complementary_max_hours: 35,
                smart_planner_break_max_hours: 2,
                alerts_layout: "single_list".into(),
                missions_module_active: true,
                report_rules_visible: false,
                annualization_period: "01 juin 2026 - 31 mai 2027".into(),
                acquisition_mode: "jours_ouvrables".into(),
                annualization_total_motives: 42,
                annualization_included_motives: 31,
                sunday_hours_in_annualization: true,
                rtt_hours_counter_active: false,
            },
        },
    ]
}

fn default_positions() -> Vec<Position> {
    vec![
        Position {
            id: "pos-cs-accueil".into(),
            site_id: "club-carre-soie".into(),
            label: "Accueil & Conseil".into(),
            color: "#3b82f6".into(),
            default_break_minutes: 30,
            active: true,
        },
        Position {
            id: "pos-cs-coach".into(),
            site_id: "club-carre-soie".into(),
            label: "Coach Plateau".into(),
            color: "#8b5cf6".into(),
            default_break_minutes: 30,
            active: true,
        },
        Position {
            id: "pos-cs-entretien-a".into(),
            site_id: "club-carre-soie".into(),
            label: "Entretien".into(),
            color: "#10b981".into(),
            default_break_minutes: 20,
            active: true,
        },
        Position {
            id: "pos-cs-entretien-b".into(),
            site_id: "club-carre-soie".into(),
            label: "Entretien".into(),
            color: "#14b8a6".into(),
            default_break_minutes: 20,
            active: true,
        },
        Position {
            id: "pos-bey-accueil".into(),
            site_id: "club-beynost".into(),
            label: "Accueil Club".into(),
            color: "#3b82f6".into(),
            default_break_minutes: 30,
            active: true,
        },
        Position {
            id: "pos-bey-coach".into(),
            site_id: "club-beynost".into(),
            label: "Coach Collectifs".into(),
            color: "#a855f7".into(),
            default_break_minutes: 30,
            active: true,
        },
    ]
}

fn default_teams() -> Vec<Team> {
    vec![
        Team {
            id: "team-cs-accueil".into(),
            site_id: "club-carre-soie".into(),
            name: "Accueil Carré de Soie".into(),
        },
        Team {
            id: "team-cs-coaching".into(),
            site_id: "club-carre-soie".into(),
            name: "Coaching Carré de Soie".into(),
        },
        Team {
            id: "team-bey-accueil".into(),
            site_id: "club-beynost".into(),
            name: "Accueil Beynost".into(),
        },
        Team {
            id: "team-bey-coaching".into(),
            site_id: "club-beynost".into(),
            name: "Coaching Beynost".into(),
        },
    ]
}

fn env_non_empty(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn default_demo_recovery_cases() -> Vec<RecoveryCaseRecord> {
    vec![
        RecoveryCaseRecord {
            id: "rec-1".into(),
            member_id: "hm-2".into(),
            member_name: "Romain Vasseur".into(),
            club_id: "carre-de-soie".into(),
            phone: "06 44 19 82 10".into(),
            email: "romain.vasseur@exemple.fr".into(),
            contract_label: "Abonnement Bi-Clubs 12 mois (39,90 €/mois)".into(),
            amount_due_eur: 39.9,
            days_overdue: 14,
            unpaid_reason: "Rejet SEPA (AM04) — Provision insuffisante".into(),
            billed_months: vec!["Octobre 2026".into()],
            has_signed_contract: true,
            has_id_and_rib: true,
            has_cgv_accepted: true,
            missing_docs: vec![],
            status: "a_relancer".into(),
            relance_count: 1,
            last_action_note: "Portillon bloqué automatiquement · SMS de régularisation envoyé.".into(),
        },
        RecoveryCaseRecord {
            id: "rec-2".into(),
            member_id: "hm-5".into(),
            member_name: "Kévin Moreau".into(),
            club_id: "beynost".into(),
            phone: "06 52 78 41 09".into(),
            email: "kevin.moreau@exemple.fr".into(),
            contract_label: "Formule Performance Engagement 12 mois (49,90 €/mois)".into(),
            amount_due_eur: 149.7,
            days_overdue: 64,
            unpaid_reason: "Opposition bancaire sur mandat SEPA (MD01 / R01)".into(),
            billed_months: vec!["Août 2026".into(), "Septembre 2026".into(), "Octobre 2026".into()],
            has_signed_contract: true,
            has_id_and_rib: true,
            has_cgv_accepted: true,
            missing_docs: vec![],
            status: "pret_contentieux".into(),
            relance_count: 3,
            last_action_note: "2 relances SMS + mise en demeure restée sans réponse · Dossier complet pour contentieux.".into(),
        },
        RecoveryCaseRecord {
            id: "rec-3".into(),
            member_id: "hm-6".into(),
            member_name: "Laura Bernard".into(),
            club_id: "carre-de-soie".into(),
            phone: "06 31 09 77 45".into(),
            email: "laura.bernard@exemple.fr".into(),
            contract_label: "Abonnement Liberté Sans Engagement (44,90 €/mois)".into(),
            amount_due_eur: 89.8,
            days_overdue: 38,
            unpaid_reason: "Rejet SEPA (AC04) — Compte bancaire clôturé".into(),
            billed_months: vec!["Septembre 2026".into(), "Octobre 2026".into()],
            has_signed_contract: true,
            has_id_and_rib: false,
            has_cgv_accepted: true,
            missing_docs: vec!["Nouveau RIB SEPA à jour".into()],
            status: "mise_en_demeure".into(),
            relance_count: 2,
            last_action_note: "Mise en demeure envoyée · En attente de nouveau RIB ou règlement CB.".into(),
        },
        RecoveryCaseRecord {
            id: "rec-4".into(),
            member_id: "hm-7".into(),
            member_name: "Mehdi Benali".into(),
            club_id: "beynost".into(),
            phone: "06 77 63 20 18".into(),
            email: "mehdi.benali@exemple.fr".into(),
            contract_label: "Abonnement Annuel Prélèvement Mensuel (39,90 €/mois)".into(),
            amount_due_eur: 119.7,
            days_overdue: 52,
            unpaid_reason: "Mandat SEPA révoqué sans respect du préavis CGV (2 mois)".into(),
            billed_months: vec!["Août 2026".into(), "Septembre 2026".into(), "Octobre 2026".into()],
            has_signed_contract: true,
            has_id_and_rib: true,
            has_cgv_accepted: true,
            missing_docs: vec![],
            status: "pret_contentieux".into(),
            relance_count: 3,
            last_action_note: "Préavis non respecté · Dossier prêt pour transfert recouvrement.".into(),
        },
    ]
}

fn default_demo_stock_items() -> Vec<StockItemRecord> {
    vec![
        StockItemRecord {
            id: "stk-1".into(),
            club_id: "beynost".into(),
            name: "Cadenas Acier Haute Sécurité (Vente TPV 8 €)".into(),
            barcode: Some("3760123450011".into()),
            category: "Badges & TPV".into(),
            current_qty: 4,
            min_threshold: 10,
            unit: "unités".into(),
            supplier: "FitSupply Pro Lyon".into(),
            unit_priceht: 3.2,
            auto_order_prepared: true,
        },
        StockItemRecord {
            id: "stk-2".into(),
            club_id: "carre-de-soie".into(),
            name: "Serviettes Microfibres Brodées C.Fitness".into(),
            barcode: Some("3760123450028".into()),
            category: "Textile & Accueil".into(),
            current_qty: 18,
            min_threshold: 25,
            unit: "unités".into(),
            supplier: "FitSupply Pro Lyon".into(),
            unit_priceht: 4.5,
            auto_order_prepared: true,
        },
        StockItemRecord {
            id: "stk-3".into(),
            club_id: "carre-de-soie".into(),
            name: "Cartes / Badges RFID MIFARE Heitz Vierges".into(),
            barcode: Some("3760123450035".into()),
            category: "Badges & TPV".into(),
            current_qty: 85,
            min_threshold: 30,
            unit: "badges".into(),
            supplier: "Heitz System".into(),
            unit_priceht: 1.8,
            auto_order_prepared: false,
        },
        StockItemRecord {
            id: "stk-4".into(),
            club_id: "beynost".into(),
            name: "Spray Désinfectant Virucide Plateau (Bidons 5L)".into(),
            barcode: Some("3760123450042".into()),
            category: "Hygiène & Plateau".into(),
            current_qty: 9,
            min_threshold: 6,
            unit: "bidons 5L".into(),
            supplier: "Hygiène Sport Rhône".into(),
            unit_priceht: 14.9,
            auto_order_prepared: false,
        },
        StockItemRecord {
            id: "stk-maint-1".into(),
            club_id: "carre-de-soie".into(),
            name: "Câble Acier Gainé 5mm (Poulies & Machines Guidées)".into(),
            barcode: Some("3760123450103".into()),
            category: "Pièces Détachées & Maintenance".into(),
            current_qty: 6,
            min_threshold: 4,
            unit: "câbles".into(),
            supplier: "Technogym France SAV".into(),
            unit_priceht: 28.5,
            auto_order_prepared: false,
        },
        StockItemRecord {
            id: "stk-maint-2".into(),
            club_id: "beynost".into(),
            name: "Lubrifiant Silicone Tapis de Course (Bidon 1L) + Goupilles 10mm".into(),
            barcode: Some("3760123450110".into()),
            category: "Pièces Détachées & Maintenance".into(),
            current_qty: 3,
            min_threshold: 5,
            unit: "kits".into(),
            supplier: "FitSupply Pro Lyon".into(),
            unit_priceht: 19.9,
            auto_order_prepared: true,
        },
    ]
}

fn default_demo_maintenance_tickets() -> Vec<MaintenanceTicketRecord> {
    vec![
        MaintenanceTicketRecord {
            id: "mnt-cta-beynost".into(),
            club_id: "beynost".into(),
            equipment_name: "Centrale de Traitement d’Air (CTA Beynost – 15 avril)".into(),
            category: "CVC / Sauna / Douches".into(),
            issue_description: "Maintenance préventive planifiée CTA Beynost (contrôle débit air neuf & remplacement filtres).".into(),
            priority: "Préventive".into(),
            status: "Technicien planifié".into(),
            supplier_name: "ClimRhône Maintenance".into(),
            estimated_cost_eur: 240.0,
            used_part_name: None,
            created_at: "2026-04-15".into(),
        },
        MaintenanceTicketRecord {
            id: "mnt-clim-center".into(),
            club_id: "carre-de-soie".into(),
            equipment_name: "Climatisation – Espace musculation (Carré de Soie · 12:30)".into(),
            category: "CVC / Sauna / Douches".into(),
            issue_description: "Intervention maintenance climatisation plateau musculation programmée aujourd’hui à 12h30.".into(),
            priority: "Urgente".into(),
            status: "Technicien planifié".into(),
            supplier_name: "ClimRhône Maintenance".into(),
            estimated_cost_eur: 150.0,
            used_part_name: None,
            created_at: "2026-04-14".into(),
        },
        MaintenanceTicketRecord {
            id: "mnt-1".into(),
            club_id: "carre-de-soie".into(),
            equipment_name: "Presse à cuisses Biocircuit #3 (Technogym)".into(),
            category: "Technogym / Checkup".into(),
            issue_description: "Calibration servomoteur résistance électronique signalée par télémétrie Mywellness.".into(),
            priority: "Normale".into(),
            status: "Technicien planifié".into(),
            supplier_name: "Technogym France SAV".into(),
            estimated_cost_eur: 0.0,
            used_part_name: None,
            created_at: "2026-04-10".into(),
        },
        MaintenanceTicketRecord {
            id: "mnt-2".into(),
            club_id: "beynost".into(),
            equipment_name: "Lecteur Bluetooth BLE Portillon Entrée Droite (Heitz)".into(),
            category: "Portillons Heitz RFID/BT".into(),
            issue_description: "Mise à jour firmware Bluetooth Low Energy recommandée pour réduire la latence (<15 ms).".into(),
            priority: "Préventive".into(),
            status: "Signalé (Agent Maintenance)".into(),
            supplier_name: "Heitz System Support".into(),
            estimated_cost_eur: 0.0,
            used_part_name: None,
            created_at: "2026-04-08".into(),
        },
    ]
}

pub fn create_initial_seed_state() -> AppDatabaseState {
    let profiles: Vec<RoleProfile> =
        serde_json::from_str(PERMISSIONS_MATRIX_JSON).expect("permissions_matrix.json invalide");

    let mut preferences_by_employee = HashMap::new();
    for eid in [
        "emp-admin",
        "emp-master",
        "emp-planif-av",
        "emp-planif-std",
        "emp-readonly",
        "emp-employe-multi",
        "emp-accueil-cs",
        "emp-mario",
        "emp-daniel",
        "emp-greg",
        "emp-sarah",
        "emp-maxime",
        "emp-chloe",
        "emp-karim",
        "emp-lea",
    ] {
        preferences_by_employee.insert(eid.to_string(), default_preferences("Français"));
    }

    AppDatabaseState {
        version: "0.2.0-lot2-fictif".into(),
        org02_billing_policy: "exclude_skello_saas".into(),
        organization: Organization {
            id: "org-cfitness-demo".into(),
            name: "C.FITNESS OS (Environnement Fictif)".into(),
            legal_name: "CFITNESS CLUBS DEMO SAS".into(),
            siren: "999000111".into(),
            vat_number: "FR00999000111".into(),
            sector: "Salles de remise en forme & Coaching sportif".into(),
            contact_email: "direction@cfitness-fictif.local".into(),
            meal_allowance_eur: 15.5,
            billing_notice: "Rubrique ORG02 (Abonnement & Facturation source) conservée dans le registre pour arbitrage explicite du propriétaire.".into(),
        },
        sites: default_sites(true),
        positions: default_positions(),
        teams: default_teams(),
        profiles,
        employees: vec![
            Employee {
                id: "emp-admin".into(),
                first_name: "Nadia".into(),
                last_name: "Moreau".into(),
                birth_name: None,
                matricule: "FICT-001".into(),
                email: "nadia.moreau@cfitness-fictif.local".into(),
                phone: "06 00 00 00 01".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "admin_systeme".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        managed_team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        position_ids: vec!["pos-cs-accueil".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "admin_systeme".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                        managed_team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                        position_ids: vec!["pos-bey-accueil".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0001".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "2 88 •• •• ••• ••• 01".into(),
                },
                contract: ContractSummary {
                    id: "ctr-001".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "forfait_jours".into(),
                    weekly_hours: None,
                    annual_days: Some(218),
                    monthly_gross_eur: Some(4200.0),
                    hourly_rate_eur: Some(27.69),
                    loaded_cost_factor: 1.42,
                    effective_from: "2024-01-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 25.0,
                    cp_n_taken: 7.0,
                    cp_n_minus1_remaining: 2.0,
                    rtt_days_remaining: Some(6.0),
                    annualization_balance_hours: None,
                },
            },
            Employee {
                id: "emp-master".into(),
                first_name: "Karim".into(),
                last_name: "Haddad".into(),
                birth_name: None,
                matricule: "FICT-002".into(),
                email: "karim.haddad@cfitness-fictif.local".into(),
                phone: "06 00 00 00 02".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "master_avance".into(),
                        show_on_planning: true,
                        team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        managed_team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        position_ids: vec!["pos-cs-accueil".into(), "pos-cs-coach".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "lecture_seule_avancee".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-bey-accueil".into()],
                        managed_team_ids: vec![],
                        position_ids: vec!["pos-bey-accueil".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0002".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "1 86 •• •• ••• ••• 02".into(),
                },
                contract: ContractSummary {
                    id: "ctr-002".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(3100.0),
                    hourly_rate_eur: Some(20.44),
                    loaded_cost_factor: 1.38,
                    effective_from: "2024-03-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 20.0,
                    cp_n_taken: 5.0,
                    cp_n_minus1_remaining: 1.5,
                    rtt_days_remaining: None,
                    annualization_balance_hours: Some(4.5),
                },
            },
            Employee {
                id: "emp-planif-av".into(),
                first_name: "Sophie".into(),
                last_name: "Laurent".into(),
                birth_name: None,
                matricule: "FICT-003".into(),
                email: "sophie.laurent@cfitness-fictif.local".into(),
                phone: "06 00 00 00 03".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-carre-soie".into(),
                    is_primary: true,
                    profile_id: "planificateur_avance".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-cs-coaching".into()],
                    managed_team_ids: vec!["team-cs-coaching".into()],
                    position_ids: vec!["pos-cs-coach".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0003".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "2 91 •• •• ••• ••• 03".into(),
                },
                contract: ContractSummary {
                    id: "ctr-003".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(2650.0),
                    hourly_rate_eur: Some(17.47),
                    loaded_cost_factor: 1.35,
                    effective_from: "2024-06-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 18.0,
                    cp_n_taken: 4.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: None,
                    annualization_balance_hours: Some(-2.0),
                },
            },
            Employee {
                id: "emp-planif-std".into(),
                first_name: "Lucas".into(),
                last_name: "Bernard".into(),
                birth_name: None,
                matricule: "FICT-004".into(),
                email: "lucas.bernard@cfitness-fictif.local".into(),
                phone: "06 00 00 00 04".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-carre-soie".into(),
                    is_primary: true,
                    profile_id: "planificateur_standard".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-cs-accueil".into()],
                    managed_team_ids: vec!["team-cs-accueil".into()],
                    position_ids: vec!["pos-cs-accueil".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0004".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "1 94 •• •• ••• ••• 04".into(),
                },
                contract: ContractSummary {
                    id: "ctr-004".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(2350.0),
                    hourly_rate_eur: Some(15.49),
                    loaded_cost_factor: 1.32,
                    effective_from: "2025-01-15".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 15.0,
                    cp_n_taken: 2.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: None,
                    annualization_balance_hours: Some(1.5),
                },
            },
            Employee {
                id: "emp-readonly".into(),
                first_name: "Claire".into(),
                last_name: "Petit".into(),
                birth_name: None,
                matricule: "FICT-005".into(),
                email: "claire.petit@cfitness-fictif.local".into(),
                phone: "06 00 00 00 05".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-beynost".into(),
                    is_primary: true,
                    profile_id: "lecture_seule_avancee".into(),
                    show_on_planning: false,
                    team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                    managed_team_ids: vec![],
                    position_ids: vec!["pos-bey-accueil".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0005".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "2 89 •• •• ••• ••• 05".into(),
                },
                contract: ContractSummary {
                    id: "ctr-005".into(),
                    site_id: "club-beynost".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(24),
                    annual_days: None,
                    monthly_gross_eur: Some(1850.0),
                    hourly_rate_eur: Some(17.78),
                    loaded_cost_factor: 1.3,
                    effective_from: "2025-02-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 14.0,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: None,
                    annualization_balance_hours: None,
                },
            },
            Employee {
                id: "emp-employe-multi".into(),
                first_name: "Thomas".into(),
                last_name: "Girard".into(),
                birth_name: None,
                matricule: "FICT-006".into(),
                email: "thomas.girard@cfitness-fictif.local".into(),
                phone: "06 00 00 00 06".into(),
                active: true,
                hr_file_status: "pending_employee".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "employe_standard".into(),
                        show_on_planning: true,
                        team_ids: vec!["team-cs-coaching".into()],
                        managed_team_ids: vec![],
                        position_ids: vec!["pos-cs-coach".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "employe_standard".into(),
                        show_on_planning: true,
                        team_ids: vec!["team-bey-coaching".into()],
                        managed_team_ids: vec![],
                        position_ids: vec!["pos-bey-coach".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0006".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "1 97 •• •• ••• ••• 06".into(),
                },
                contract: ContractSummary {
                    id: "ctr-006".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(2280.0),
                    hourly_rate_eur: Some(15.03),
                    loaded_cost_factor: 1.3,
                    effective_from: "2025-04-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 16.0,
                    cp_n_taken: 3.0,
                    cp_n_minus1_remaining: 1.0,
                    rtt_days_remaining: None,
                    annualization_balance_hours: Some(6.5),
                },
            },
            Employee {
                id: "emp-accueil-cs".into(),
                first_name: "Julie".into(),
                last_name: "Roux".into(),
                birth_name: None,
                matricule: "FICT-007".into(),
                email: "julie.roux@cfitness-fictif.local".into(),
                phone: "06 00 00 00 07".into(),
                active: true,
                hr_file_status: "incomplete_payroll".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-carre-soie".into(),
                    is_primary: true,
                    profile_id: "employe_standard".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-cs-accueil".into()],
                    managed_team_ids: vec![],
                    position_ids: vec!["pos-cs-accueil".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 0007".into(),
                    bic: "FICTFRPPXXX".into(),
                    nir_masked: "2 99 •• •• ••• ••• 07".into(),
                },
                contract: ContractSummary {
                    id: "ctr-007".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDD".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(30),
                    annual_days: None,
                    monthly_gross_eur: Some(1950.0),
                    hourly_rate_eur: Some(15.0),
                    loaded_cost_factor: 1.28,
                    effective_from: "2026-09-01".into(),
                    effective_to: Some("2027-02-28".into()),
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 5.0,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: None,
                    annualization_balance_hours: Some(0.0),
                },
            },
            Employee {
                id: "emp-mario".into(),
                first_name: "Mario".into(),
                last_name: "Carvalho".into(),
                birth_name: None,
                matricule: "CF-DIR-01".into(),
                email: "mario.carvalho@cfitness.fr".into(),
                phone: "06 14 28 50 01".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "admin_systeme".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        managed_team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        position_ids: vec!["pos-cs-accueil".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "admin_systeme".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                        managed_team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                        position_ids: vec!["pos-bey-accueil".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 1001".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "1 82 •• •• ••• ••• 11".into(),
                },
                contract: ContractSummary {
                    id: "ctr-mario".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "forfait_jours".into(),
                    weekly_hours: None,
                    annual_days: Some(218),
                    monthly_gross_eur: Some(4850.0),
                    hourly_rate_eur: Some(32.0),
                    loaded_cost_factor: 1.42,
                    effective_from: "2019-01-15".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 18.0,
                    cp_n_taken: 4.0,
                    cp_n_minus1_remaining: 2.0,
                    rtt_days_remaining: Some(6.0),
                    annualization_balance_hours: None,
                },
            },
            Employee {
                id: "emp-daniel".into(),
                first_name: "Daniel".into(),
                last_name: "Carvalho".into(),
                birth_name: None,
                matricule: "CF-DIR-02".into(),
                email: "daniel.carvalho@cfitness.fr".into(),
                phone: "06 14 28 50 02".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: true,
                        profile_id: "admin_systeme".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                        managed_team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                        position_ids: vec!["pos-bey-accueil".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: false,
                        profile_id: "admin_systeme".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        managed_team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        position_ids: vec!["pos-cs-accueil".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 2002".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "1 84 •• •• ••• ••• 22".into(),
                },
                contract: ContractSummary {
                    id: "ctr-daniel".into(),
                    site_id: "club-beynost".into(),
                    contract_type: "CDI".into(),
                    regime: "forfait_jours".into(),
                    weekly_hours: None,
                    annual_days: Some(218),
                    monthly_gross_eur: Some(4850.0),
                    hourly_rate_eur: Some(32.0),
                    loaded_cost_factor: 1.42,
                    effective_from: "2019-01-15".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 16.5,
                    cp_n_taken: 3.0,
                    cp_n_minus1_remaining: 1.5,
                    rtt_days_remaining: Some(5.0),
                    annualization_balance_hours: None,
                },
            },
            Employee {
                id: "emp-greg".into(),
                first_name: "Greg".into(),
                last_name: "Carvalho".into(),
                birth_name: None,
                matricule: "CF-MGT-01".into(),
                email: "greg.carvalho@cfitness.fr".into(),
                phone: "06 14 28 50 03".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "master_avance".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-cs-accueil".into()],
                        managed_team_ids: vec!["team-cs-accueil".into()],
                        position_ids: vec!["pos-cs-accueil".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "master_avance".into(),
                        show_on_planning: false,
                        team_ids: vec!["team-bey-accueil".into()],
                        managed_team_ids: vec!["team-bey-accueil".into()],
                        position_ids: vec!["pos-bey-accueil".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 3003".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "1 87 •• •• ••• ••• 33".into(),
                },
                contract: ContractSummary {
                    id: "ctr-greg".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(3943.33),
                    hourly_rate_eur: Some(26.0),
                    loaded_cost_factor: 1.4,
                    effective_from: "2021-03-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 15.0,
                    cp_n_taken: 2.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: Some(4.0),
                    annualization_balance_hours: Some(0.0),
                },
            },
            Employee {
                id: "emp-sarah".into(),
                first_name: "Sarah".into(),
                last_name: "Bensaid".into(),
                birth_name: None,
                matricule: "CF-MGT-02".into(),
                email: "sarah.bensaid@cfitness.fr".into(),
                phone: "06 45 78 12 90".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-carre-soie".into(),
                    is_primary: true,
                    profile_id: "master_avance".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                    managed_team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                    position_ids: vec!["pos-cs-accueil".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 4004".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "2 90 •• •• ••• ••• 44".into(),
                },
                contract: ContractSummary {
                    id: "ctr-sarah".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(2805.8),
                    hourly_rate_eur: Some(18.5),
                    loaded_cost_factor: 1.38,
                    effective_from: "2022-04-04".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 14.0,
                    cp_n_taken: 2.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: Some(2.0),
                    annualization_balance_hours: Some(2.5),
                },
            },
            Employee {
                id: "emp-maxime".into(),
                first_name: "Maxime".into(),
                last_name: "Giraud".into(),
                birth_name: None,
                matricule: "CF-COM-01".into(),
                email: "maxime.giraud@cfitness.fr".into(),
                phone: "06 52 19 83 41".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![
                    EmployeeSiteAccess {
                        site_id: "club-carre-soie".into(),
                        is_primary: true,
                        profile_id: "planificateur_standard".into(),
                        show_on_planning: true,
                        team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                        managed_team_ids: vec!["team-cs-accueil".into()],
                        position_ids: vec!["pos-cs-accueil".into()],
                    },
                    EmployeeSiteAccess {
                        site_id: "club-beynost".into(),
                        is_primary: false,
                        profile_id: "employe_standard".into(),
                        show_on_planning: true,
                        team_ids: vec!["team-bey-accueil".into()],
                        managed_team_ids: vec![],
                        position_ids: vec!["pos-bey-accueil".into()],
                    },
                ],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 5005".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "1 95 •• •• ••• ••• 55".into(),
                },
                contract: ContractSummary {
                    id: "ctr-maxime".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(1823.03),
                    hourly_rate_eur: Some(12.02),
                    loaded_cost_factor: 1.32,
                    effective_from: "2026-10-01".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 9.5,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: Some(1.0),
                    annualization_balance_hours: Some(1.0),
                },
            },
            Employee {
                id: "emp-chloe".into(),
                first_name: "Chloé".into(),
                last_name: "Morel".into(),
                birth_name: None,
                matricule: "CF-COM-02".into(),
                email: "chloe.morel@cfitness.fr".into(),
                phone: "06 61 34 09 22".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-beynost".into(),
                    is_primary: true,
                    profile_id: "employe_standard".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-bey-accueil".into()],
                    managed_team_ids: vec![],
                    position_ids: vec!["pos-bey-accueil".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 6006".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "2 97 •• •• ••• ••• 66".into(),
                },
                contract: ContractSummary {
                    id: "ctr-chloe".into(),
                    site_id: "club-beynost".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(1823.03),
                    hourly_rate_eur: Some(12.02),
                    loaded_cost_factor: 1.32,
                    effective_from: "2026-10-18".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 11.0,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: Some(1.5),
                    annualization_balance_hours: Some(0.0),
                },
            },
            Employee {
                id: "emp-karim".into(),
                first_name: "Karim".into(),
                last_name: "Haddad".into(),
                birth_name: None,
                matricule: "CF-COA-01".into(),
                email: "karim.haddad@cfitness.fr".into(),
                phone: "06 73 91 44 08".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-carre-soie".into(),
                    is_primary: true,
                    profile_id: "employe_standard".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-cs-coaching".into()],
                    managed_team_ids: vec![],
                    position_ids: vec!["pos-cs-coach".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 7007".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "1 93 •• •• ••• ••• 77".into(),
                },
                contract: ContractSummary {
                    id: "ctr-karim".into(),
                    site_id: "club-carre-soie".into(),
                    contract_type: "CDI".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(1823.03),
                    hourly_rate_eur: Some(12.02),
                    loaded_cost_factor: 1.32,
                    effective_from: "2026-09-05".into(),
                    effective_to: None,
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 15.0,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: Some(0.0),
                    annualization_balance_hours: Some(0.0),
                },
            },
            Employee {
                id: "emp-lea".into(),
                first_name: "Léa".into(),
                last_name: "Fontaine".into(),
                birth_name: None,
                matricule: "CF-APP-01".into(),
                email: "lea.fontaine.cfa@gmail.com".into(),
                phone: "07 82 50 16 79".into(),
                active: true,
                hr_file_status: "complete".into(),
                site_accesses: vec![EmployeeSiteAccess {
                    site_id: "club-beynost".into(),
                    is_primary: true,
                    profile_id: "employe_standard".into(),
                    show_on_planning: true,
                    team_ids: vec!["team-bey-coaching".into()],
                    managed_team_ids: vec![],
                    position_ids: vec!["pos-bey-coach".into()],
                }],
                sensitive_bank: SensitiveBankInfo {
                    payment_mode: "Virement".into(),
                    iban_masked: "FR76 •••• •••• •••• 8008".into(),
                    bic: "CFITFRPPXXX".into(),
                    nir_masked: "2 03 •• •• ••• ••• 88".into(),
                },
                contract: ContractSummary {
                    id: "ctr-lea".into(),
                    site_id: "club-beynost".into(),
                    contract_type: "Alternance".into(),
                    regime: "hours".into(),
                    weekly_hours: Some(35),
                    annual_days: None,
                    monthly_gross_eur: Some(1801.8),
                    hourly_rate_eur: Some(11.88),
                    loaded_cost_factor: 1.2,
                    effective_from: "2025-09-01".into(),
                    effective_to: Some("2027-08-31".into()),
                },
                counter: EmployeeCounter {
                    cp_n_acquired: 7.5,
                    cp_n_taken: 0.0,
                    cp_n_minus1_remaining: 0.0,
                    rtt_days_remaining: Some(0.0),
                    annualization_balance_hours: Some(0.0),
                },
            },
        ],
        shifts: vec![
            Shift {
                id: "sh-tst01".into(),
                site_id: "club-carre-soie".into(),
                date: "2026-11-16".into(),
                start_time: "09:00".into(),
                end_time: "17:00".into(),
                break_minutes: 30,
                employee_id: Some("emp-employe-multi".into()),
                position_id: "pos-cs-coach".into(),
                mission_label: None,
                tasks: vec!["Accueil adhérents matin".into(), "Contrôle matériel plateau".into()],
                lock_state: "none".into(),
                published: true,
            },
            Shift {
                id: "sh-accueil-1".into(),
                site_id: "club-carre-soie".into(),
                date: "2026-11-16".into(),
                start_time: "08:00".into(),
                end_time: "15:30".into(),
                break_minutes: 30,
                employee_id: Some("emp-accueil-cs".into()),
                position_id: "pos-cs-accueil".into(),
                mission_label: None,
                tasks: vec!["Ouverture caisse accueil".into()],
                lock_state: "red".into(),
                published: true,
            },
            Shift {
                id: "sh-unassigned-1".into(),
                site_id: "club-carre-soie".into(),
                date: "2026-11-17".into(),
                start_time: "17:00".into(),
                end_time: "21:00".into(),
                break_minutes: 0,
                employee_id: None,
                position_id: "pos-cs-coach".into(),
                mission_label: None,
                tasks: vec!["Fermeture espace coaching".into()],
                lock_state: "none".into(),
                published: false,
            },
            Shift {
                id: "sh-bey-multi".into(),
                site_id: "club-beynost".into(),
                date: "2026-11-18".into(),
                start_time: "10:00".into(),
                end_time: "18:00".into(),
                break_minutes: 45,
                employee_id: Some("emp-employe-multi".into()),
                position_id: "pos-bey-coach".into(),
                mission_label: Some("Animation bilan forme Beynost".into()),
                tasks: vec!["Séance cours collectifs".into()],
                lock_state: "none".into(),
                published: true,
            },
            // Cas positifs par identité (ticket #1) : chaque collaborateur voit
            // son propre planning publié, distinct de celui des autres.
            Shift {
                id: "sh-maxime-1".into(),
                site_id: "club-carre-soie".into(),
                date: "2026-11-19".into(),
                start_time: "09:00".into(),
                end_time: "17:00".into(),
                break_minutes: 30,
                employee_id: Some("emp-maxime".into()),
                position_id: "pos-cs-accueil".into(),
                mission_label: Some("Accueil et suivi adhérents Carré de Soie".into()),
                tasks: vec!["Ouverture accueil".into(), "Relances adhérents".into()],
                lock_state: "none".into(),
                published: true,
            },
            Shift {
                id: "sh-chloe-1".into(),
                site_id: "club-beynost".into(),
                date: "2026-11-19".into(),
                start_time: "10:00".into(),
                end_time: "18:00".into(),
                break_minutes: 30,
                employee_id: Some("emp-chloe".into()),
                position_id: "pos-bey-accueil".into(),
                mission_label: Some("Accueil Beynost".into()),
                tasks: vec!["Accueil adhérents".into(), "Gestion des abonnements".into()],
                lock_state: "none".into(),
                published: true,
            },
            Shift {
                id: "sh-sarah-1".into(),
                site_id: "club-carre-soie".into(),
                date: "2026-11-20".into(),
                start_time: "08:00".into(),
                end_time: "16:00".into(),
                break_minutes: 30,
                employee_id: Some("emp-sarah".into()),
                position_id: "pos-cs-accueil".into(),
                mission_label: Some("Pilotage accueil et coaching Carré de Soie".into()),
                tasks: vec!["Brief équipe accueil".into(), "Suivi coaching".into()],
                lock_state: "none".into(),
                published: true,
            },
        ],
        leave_requests: vec![
            LeaveRequest {
                id: "req-001".into(),
                employee_id: "emp-accueil-cs".into(),
                site_id: "club-carre-soie".into(),
                motive: "Congé payé".into(),
                start_date: "2026-12-21".into(),
                end_date: "2026-12-24".into(),
                status: "pending".into(),
                comment: "Fêtes de fin d’année (donnée fictive)".into(),
            },
            LeaveRequest {
                id: "req-002".into(),
                employee_id: "emp-employe-multi".into(),
                site_id: "club-carre-soie".into(),
                motive: "Récupération".into(),
                start_date: "2026-11-27".into(),
                end_date: "2026-11-27".into(),
                status: "pending".into(),
                comment: "Demi-journée récupération coaching".into(),
            },
            LeaveRequest {
                id: "req-003".into(),
                employee_id: "emp-readonly".into(),
                site_id: "club-beynost".into(),
                motive: "Formation".into(),
                start_date: "2026-12-03".into(),
                end_date: "2026-12-04".into(),
                status: "accepted".into(),
                comment: "Recyclage secourisme fictif".into(),
            },
            // Cas positifs par identité (ticket #1) : demandes propres à chaque collaborateur.
            LeaveRequest {
                id: "req-maxime-1".into(),
                employee_id: "emp-maxime".into(),
                site_id: "club-carre-soie".into(),
                motive: "Congé payé".into(),
                start_date: "2026-12-07".into(),
                end_date: "2026-12-08".into(),
                status: "pending".into(),
                comment: "Congés personnels (donnée fictive)".into(),
            },
            LeaveRequest {
                id: "req-chloe-1".into(),
                employee_id: "emp-chloe".into(),
                site_id: "club-beynost".into(),
                motive: "Récupération".into(),
                start_date: "2026-11-26".into(),
                end_date: "2026-11-26".into(),
                status: "pending".into(),
                comment: "Récupération heures accueil (donnée fictive)".into(),
            },
            LeaveRequest {
                id: "req-sarah-1".into(),
                employee_id: "emp-sarah".into(),
                site_id: "club-carre-soie".into(),
                motive: "Formation".into(),
                start_date: "2026-12-10".into(),
                end_date: "2026-12-11".into(),
                status: "accepted".into(),
                comment: "Formation management (donnée fictive)".into(),
            },
        ],
        anomalies: vec![
            TimeclockAnomaly {
                id: "anom-001".into(),
                employee_id: "emp-accueil-cs".into(),
                site_id: "club-carre-soie".into(),
                date: "2026-11-13".into(),
                planned_range: "08:00 - 15:30".into(),
                punched_range: "08:11 - 15:30".into(),
                delta_minutes: -11,
                has_proof_photo: true,
                status: "to_review".into(),
            },
            TimeclockAnomaly {
                id: "anom-002".into(),
                employee_id: "emp-employe-multi".into(),
                site_id: "club-beynost".into(),
                date: "2026-11-12".into(),
                planned_range: "10:00 - 18:00".into(),
                punched_range: "10:00 - 18:18".into(),
                delta_minutes: 18,
                has_proof_photo: true,
                status: "to_review".into(),
            },
        ],
        kpis: vec![
            SiteKpis {
                site_id: "club-carre-soie".into(),
                period_label: "Novembre 2026 (Données fictives)".into(),
                revenue_eur: Some(48200.0),
                productivity_per_hour: Some(112.35),
                payroll_mass_eur: Some(14850.0),
                worked_hours: Some(429.0),
            },
            SiteKpis {
                site_id: "club-beynost".into(),
                period_label: "Novembre 2026 (Données fictives)".into(),
                revenue_eur: None,
                productivity_per_hour: None,
                payroll_mass_eur: Some(10940.0),
                worked_hours: Some(312.0),
            },
        ],
        audit_log: vec![
            AuditEvent {
                id: "aud-001".into(),
                timestamp: "2026-11-14T09:15:00Z".into(),
                actor_id: "emp-admin".into(),
                actor_name: "Nadia Moreau".into(),
                action_type: "Modification de permissions".into(),
                summary: "Initialisation de la matrice des 6 profils sur C.Fitness OS (Lot 2)".into(),
                site_id: "org".into(),
                target_label: "Matrice DRO01–DRO05".into(),
                before_summary: None,
                after_summary: None,
            },
            AuditEvent {
                id: "aud-002".into(),
                timestamp: "2026-11-13T18:10:00Z".into(),
                actor_id: "emp-master".into(),
                actor_name: "Karim Haddad".into(),
                action_type: "Publication de planning".into(),
                summary: "Publication semaine S47 (Carré de Soie — Fictif)".into(),
                site_id: "club-carre-soie".into(),
                target_label: "Planning S47".into(),
                before_summary: None,
                after_summary: None,
            },
            AuditEvent {
                id: "aud-003".into(),
                timestamp: "2026-11-13T14:22:00Z".into(),
                actor_id: "emp-planif-av".into(),
                actor_name: "Sophie Laurent".into(),
                action_type: "Création de shift".into(),
                summary: "Ajout shift 09:00–17:00 pause 30m (7h30)".into(),
                site_id: "club-carre-soie".into(),
                target_label: "Thomas Girard".into(),
                before_summary: None,
                after_summary: None,
            },
            AuditEvent {
                id: "aud-004".into(),
                timestamp: "2026-11-12T11:05:00Z".into(),
                actor_id: "emp-admin".into(),
                actor_name: "Nadia Moreau".into(),
                action_type: "Paramétrage établissement".into(),
                summary: "Activation module Missions sur Beynost et Règles rapport sur Carré de Soie".into(),
                site_id: "org".into(),
                target_label: "PAR07 / PAR04".into(),
                before_summary: None,
                after_summary: None,
            },
        ],
        preferences_by_employee,
        ambiguities: ambiguities_baseline(),
        lead_forms: vec![
            LeadFormRecord {
                id: "frm-1".into(),
                name: "Séance Découverte Carré de Soie".into(),
                club_id: "carre-de-soie".into(),
                published: true,
                section_titles: vec![
                    "Coordonnées".into(),
                    "Objectif fitness".into(),
                    "Consentement RGPD".into(),
                ],
                fields: vec![
                    LeadFormFieldRecord { id: "fld-fn".into(), label: "Prénom".into(), field_type: "text".into(), required: true, options: vec![] },
                    LeadFormFieldRecord { id: "fld-ln".into(), label: "Nom".into(), field_type: "text".into(), required: true, options: vec![] },
                    LeadFormFieldRecord { id: "fld-em".into(), label: "Email".into(), field_type: "email".into(), required: true, options: vec![] },
                    LeadFormFieldRecord { id: "fld-ph".into(), label: "Téléphone".into(), field_type: "tel".into(), required: false, options: vec![] },
                    LeadFormFieldRecord { id: "fld-goal".into(), label: "Objectif".into(), field_type: "select".into(), required: false, options: vec!["Biocircuit".into(), "Perte de poids".into(), "Remise en forme".into()] },
                    LeadFormFieldRecord { id: "fld-rgpd".into(), label: "J’accepte le traitement RGPD de mes données".into(), field_type: "checkbox".into(), required: true, options: vec![] },
                ],
                responses_count: 1,
                sample_responses: vec![LeadFormSampleResponseRecord {
                    id: "rep-1".into(),
                    full_name: "Camille Garnier".into(),
                    email: "camille.garnier@exemple.fr".into(),
                    phone: "0611223344".into(),
                    rgpd_consent: true,
                    answers: serde_json::json!({"fld-fn": "Camille", "fld-ln": "Garnier", "fld-em": "camille.garnier@exemple.fr", "fld-goal": "Biocircuit", "fld-rgpd": true}),
                    submitted_at: "2026-11-16 14:20".into(),
                    linked_prospect_id: Some("pr-1".into()),
                }],
            },
            LeadFormRecord {
                id: "frm-2".into(),
                name: "Bilan Checkup Beynost".into(),
                club_id: "beynost".into(),
                published: true,
                section_titles: vec!["Identité".into(), "Disponibilités".into(), "Accord RGPD".into()],
                fields: vec![
                    LeadFormFieldRecord { id: "fld-fn2".into(), label: "Prénom".into(), field_type: "text".into(), required: true, options: vec![] },
                    LeadFormFieldRecord { id: "fld-em2".into(), label: "Email".into(), field_type: "email".into(), required: true, options: vec![] },
                    LeadFormFieldRecord { id: "fld-rgpd2".into(), label: "Accord RGPD obligatoire".into(), field_type: "checkbox".into(), required: true, options: vec![] },
                ],
                responses_count: 1,
                sample_responses: vec![LeadFormSampleResponseRecord {
                    id: "rep-2".into(),
                    full_name: "Hugo Lefebvre".into(),
                    email: "hugo.lefebvre@exemple.fr".into(),
                    phone: "0677889900".into(),
                    rgpd_consent: true,
                    answers: serde_json::json!({"fld-fn2": "Hugo", "fld-em2": "hugo.lefebvre@exemple.fr", "fld-rgpd2": true}),
                    submitted_at: "2026-11-15 11:05".into(),
                    linked_prospect_id: Some("pr-2".into()),
                }],
            },
            LeadFormRecord {
                id: "frm-3".into(),
                name: "Offre Rentrée Coaching (Brouillon)".into(),
                club_id: "carre-de-soie".into(),
                published: false,
                section_titles: vec!["Identité".into()],
                fields: vec![LeadFormFieldRecord { id: "fld-fn3".into(), label: "Prénom".into(), field_type: "text".into(), required: true, options: vec![] }],
                responses_count: 0,
                sample_responses: vec![],
            },
        ],
        lead_prospects: vec![
            LeadProspectRecord {
                id: "pr-1".into(),
                gender: "F".into(),
                first_name: "Camille".into(),
                last_name: "Garnier".into(),
                email: "camille.garnier@exemple.fr".into(),
                phone: "0611223344".into(),
                street: "12 Rue République".into(),
                postal_code: "69120".into(),
                city: "Vaulx-en-Velin".into(),
                birth_date: "1995-05-15".into(),
                comment: "Intéressée par le Biocircuit".into(),
                club_id: "carre-de-soie".into(),
                source: "Site c.fitness".into(),
                stage: "Contacté".into(),
                lead_status: "Contacté".into(),
                rgpd_consent: true,
                segments: vec!["Relance Biocircuit".into()],
                trial_date: None,
                assigned_to_id: Some("emp-maxime".into()),
                last_visit_at: Some("2026-11-16 10:15".into()),
                days_without_visit: 5,
                last_inbound_reply_at: None,
                archived_at: None,
                converted_offer: None,
                is_archived: false,
                archive_reason: None,
                client_scope: None,
                client_club_ids: vec![],
                has_active_vacation: false,
                last_commercial_touch_at: None,
                created_at: "2026-11-16".into(),
            },
            LeadProspectRecord {
                id: "pr-2".into(),
                gender: "M".into(),
                first_name: "Hugo".into(),
                last_name: "Lefebvre".into(),
                email: "hugo.lefebvre@exemple.fr".into(),
                phone: "0677889900".into(),
                street: "5 Av de Lyon".into(),
                postal_code: "01700".into(),
                city: "Beynost".into(),
                birth_date: "1991-03-22".into(),
                comment: "Checkup Technogym".into(),
                club_id: "beynost".into(),
                source: "Tablette accueil".into(),
                stage: "Nouveau".into(),
                lead_status: "Nouveau".into(),
                rgpd_consent: true,
                segments: vec![],
                trial_date: None,
                assigned_to_id: Some("emp-chloe".into()),
                last_visit_at: None,
                days_without_visit: 0,
                last_inbound_reply_at: None,
                archived_at: None,
                converted_offer: None,
                is_archived: false,
                archive_reason: None,
                client_scope: None,
                client_club_ids: vec![],
                has_active_vacation: false,
                last_commercial_touch_at: None,
                created_at: "2026-11-15".into(),
            },
        ],
        lead_appointments: vec![
            LeadAppointmentRecord {
                id: "slot-seed-cds".into(),
                club_id: "carre-de-soie".into(),
                coach_id: "emp-karim".into(),
                type_name: "Séance Découverte Coaching".into(),
                prospect_id: Some("pr-1".into()),
                prospect_name: Some("Camille Garnier".into()),
                prospect_email: Some("camille.garnier@exemple.fr".into()),
                activity_id: Some("act-seed-cds".into()),
                date: "2026-11-25".into(),
                start_time: "10:00".into(),
                duration_minutes: 60,
                capacity_max: 1,
                current_booked_count: 1,
                payment_status: "non_requis".into(),
                status: "confirme".into(),
            },
        ],
        lead_activities: vec![
            LeadActivityRecord {
                id: "act-seed-cds".into(),
                activity_type: "APPOINTMENT".into(),
                title: "RDV Séance Découverte Coaching".into(),
                prospect_id: Some("pr-1".into()),
                prospect_name: "Camille Garnier".into(),
                club_id: "carre-de-soie".into(),
                due_at: "2026-11-25T10:00".into(),
                status: "todo".into(),
                assigned_to_id: "emp-karim".into(),
                status_label: "Confirmé".into(),
            },
        ],
        lead_settings_by_club: default_lead_settings_by_club(),
        lead_alerts: vec![],
        processed_lead_events: vec![],
        lead_scheduler_status: crate::models::LeadSchedulerStatus::default(),
        // Direction : Finances par défaut. Aucune habilitation nominative
        // n'est accordée à Sarah (responsable de club) tant qu'elle n'est pas
        // explicitement ajoutée ici (ticket #3).
        finance_authorized_employee_ids: vec![
            "emp-admin".into(),
            "emp-mario".into(),
            "emp-daniel".into(),
        ],
        recovery_authorized_employee_ids: vec!["emp-greg".into()],
        stock_authorized_employee_ids: vec![],
        reports_authorized_employee_ids: vec![],
        module_delegations: vec![],
        password_hashes_by_employee: HashMap::new(),
        recovery_cases: default_demo_recovery_cases(),
        stock_items: default_demo_stock_items(),
        maintenance_tickets: default_demo_maintenance_tickets(),
    }
}

/// État initial vierge pour un déploiement en production (`CFITNESS_DEMO_MODE=0`).
/// Aucun salarié fictif, aucun shift fictif et aucune donnée opérationnelle simulée.
pub fn create_production_initial_state() -> AppDatabaseState {
    let profiles: Vec<RoleProfile> =
        serde_json::from_str(PERMISSIONS_MATRIX_JSON).expect("permissions_matrix.json invalide");

    let admin_id = env_non_empty("CFITNESS_INITIAL_ADMIN_ID", "emp-mario");
    let admin_email = env_non_empty("CFITNESS_INITIAL_ADMIN_EMAIL", "direction@c.fitness");
    let admin_first_name = env_non_empty("CFITNESS_INITIAL_ADMIN_FIRST_NAME", "Direction");
    let admin_last_name = env_non_empty("CFITNESS_INITIAL_ADMIN_LAST_NAME", "C.Fitness");

    let mut prod_prefs = default_preferences("Français");
    prod_prefs.calendar_feed_enabled = false;
    prod_prefs.calendar_feed_token = String::new();

    let mut preferences_by_employee = HashMap::new();
    preferences_by_employee.insert(admin_id.clone(), prod_prefs);

    AppDatabaseState {
        version: "1.0.0-production".into(),
        org02_billing_policy: "exclude_skello_saas".into(),
        organization: Organization {
            id: "org-cfitness".into(),
            name: "C.FITNESS OS".into(),
            legal_name: "C.FITNESS CLUBS".into(),
            siren: String::new(),
            vat_number: String::new(),
            sector: "Salles de remise en forme & Coaching sportif".into(),
            contact_email: admin_email.clone(),
            meal_allowance_eur: 15.5,
            billing_notice: "Configuration production C.Fitness OS.".into(),
        },
        sites: default_sites(false),
        positions: default_positions(),
        teams: default_teams(),
        profiles,
        employees: vec![Employee {
            id: admin_id.clone(),
            first_name: admin_first_name,
            last_name: admin_last_name,
            birth_name: None,
            matricule: "ADM-001".into(),
            email: admin_email,
            phone: String::new(),
            active: true,
            hr_file_status: "complete".into(),
            site_accesses: vec![
                EmployeeSiteAccess {
                    site_id: "club-carre-soie".into(),
                    is_primary: true,
                    profile_id: "admin_systeme".into(),
                    show_on_planning: false,
                    team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                    managed_team_ids: vec!["team-cs-accueil".into(), "team-cs-coaching".into()],
                    position_ids: vec!["pos-cs-accueil".into()],
                },
                EmployeeSiteAccess {
                    site_id: "club-beynost".into(),
                    is_primary: false,
                    profile_id: "admin_systeme".into(),
                    show_on_planning: false,
                    team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                    managed_team_ids: vec!["team-bey-accueil".into(), "team-bey-coaching".into()],
                    position_ids: vec!["pos-bey-accueil".into()],
                },
            ],
            sensitive_bank: SensitiveBankInfo {
                payment_mode: "Virement".into(),
                iban_masked: String::new(),
                bic: String::new(),
                nir_masked: String::new(),
            },
            contract: ContractSummary {
                id: "ctr-adm-001".into(),
                site_id: "club-carre-soie".into(),
                contract_type: "Mandat / Direction".into(),
                regime: "forfait_jours".into(),
                weekly_hours: None,
                annual_days: None,
                monthly_gross_eur: None,
                hourly_rate_eur: None,
                loaded_cost_factor: 1.0,
                effective_from: "2026-01-01".into(),
                effective_to: None,
            },
            counter: EmployeeCounter {
                cp_n_acquired: 0.0,
                cp_n_taken: 0.0,
                cp_n_minus1_remaining: 0.0,
                rtt_days_remaining: None,
                annualization_balance_hours: None,
            },
        }],
        shifts: vec![],
        leave_requests: vec![],
        anomalies: vec![],
        kpis: vec![],
        audit_log: vec![],
        preferences_by_employee,
        ambiguities: vec![],
        lead_forms: vec![],
        lead_prospects: vec![],
        lead_appointments: vec![],
        lead_activities: vec![],
        lead_settings_by_club: default_lead_settings_by_club(),
        lead_alerts: vec![],
        processed_lead_events: vec![],
        lead_scheduler_status: crate::models::LeadSchedulerStatus::default(),
        finance_authorized_employee_ids: vec![admin_id],
        recovery_authorized_employee_ids: vec![],
        stock_authorized_employee_ids: vec![],
        reports_authorized_employee_ids: vec![],
        module_delegations: vec![],
        password_hashes_by_employee: HashMap::new(),
        recovery_cases: vec![],
        stock_items: vec![],
        maintenance_tickets: vec![],
    }
}

pub fn apply_admin_password_bootstrap_with(
    state: &mut AppDatabaseState,
    raw_pwd: &str,
    target_id: &str,
) -> bool {
    if !state.password_hashes_by_employee.is_empty() {
        return false;
    }
    let clean_pwd = raw_pwd.trim();
    if clean_pwd.chars().count() < 12 {
        return false;
    }
    let clean_target = if target_id.trim().is_empty() {
        "emp-mario"
    } else {
        target_id.trim()
    };

    let mut updated = false;
    if state
        .employees
        .iter()
        .any(|e| e.id == clean_target && e.active)
    {
        state.password_hashes_by_employee.insert(
            clean_target.to_string(),
            crate::auth_passwords::hash_password(clean_pwd),
        );
        updated = true;
    }
    if clean_target != "emp-admin"
        && state
            .employees
            .iter()
            .any(|e| e.id == "emp-admin" && e.active)
    {
        state.password_hashes_by_employee.insert(
            "emp-admin".to_string(),
            crate::auth_passwords::hash_password(clean_pwd),
        );
        updated = true;
    }
    updated
}

fn apply_initial_admin_password_bootstrap(state: &mut AppDatabaseState) -> bool {
    let Ok(raw_pwd) = std::env::var("CFITNESS_INITIAL_ADMIN_PASSWORD") else {
        return false;
    };
    let target_id = env_non_empty("CFITNESS_INITIAL_ADMIN_ID", "emp-mario");
    apply_admin_password_bootstrap_with(state, &raw_pwd, &target_id)
}

pub fn load_or_init_state(data_dir: &Path) -> AppDatabaseState {
    let demo_mode = crate::routes::is_demo_mode();
    let state_file = data_dir.join("cfitness_state.json");
    if state_file.exists() {
        if let Ok(raw) = fs::read_to_string(&state_file) {
            if let Ok(mut parsed) = serde_json::from_str::<AppDatabaseState>(&raw) {
                let mut migrated = false;
                if demo_mode {
                    let baseline = create_initial_seed_state();
                    for seed_emp in baseline.employees {
                        if !parsed.employees.iter().any(|e| e.id == seed_emp.id) {
                            parsed.employees.push(seed_emp);
                            migrated = true;
                        }
                    }
                    for seed_shift in baseline.shifts {
                        if !parsed.shifts.iter().any(|s| s.id == seed_shift.id) {
                            parsed.shifts.push(seed_shift);
                            migrated = true;
                        }
                    }
                    if parsed.lead_forms.is_empty() {
                        parsed.lead_forms = baseline.lead_forms;
                        migrated = true;
                    }
                    if parsed.lead_prospects.is_empty() {
                        parsed.lead_prospects = baseline.lead_prospects;
                        migrated = true;
                    }
                    if parsed.lead_appointments.is_empty() {
                        parsed.lead_appointments = baseline.lead_appointments;
                        migrated = true;
                    }
                    if parsed.lead_activities.is_empty() {
                        parsed.lead_activities = baseline.lead_activities;
                        migrated = true;
                    }
                    for (eid, prefs) in baseline.preferences_by_employee {
                        parsed.preferences_by_employee.entry(eid).or_insert_with(|| {
                            migrated = true;
                            prefs
                        });
                    }
                    if parsed.recovery_cases.is_empty() {
                        parsed.recovery_cases = baseline.recovery_cases;
                        migrated = true;
                    }
                    if parsed.stock_items.is_empty() {
                        parsed.stock_items = baseline.stock_items;
                        migrated = true;
                    }
                    if parsed.maintenance_tickets.is_empty() {
                        parsed.maintenance_tickets = baseline.maintenance_tickets;
                        migrated = true;
                    }
                }
                if parsed.lead_settings_by_club.is_empty() {
                    parsed.lead_settings_by_club = default_lead_settings_by_club();
                    migrated = true;
                }
                if apply_initial_admin_password_bootstrap(&mut parsed) {
                    migrated = true;
                }
                if migrated {
                    let _ = persist_state(data_dir, &parsed);
                }
                return parsed;
            }
        }
    }
    let mut state = if demo_mode {
        create_initial_seed_state()
    } else {
        create_production_initial_state()
    };
    let _ = apply_initial_admin_password_bootstrap(&mut state);
    let _ = persist_state(data_dir, &state);
    state
}

pub fn persist_state(data_dir: &Path, state: &AppDatabaseState) -> std::io::Result<()> {
    fs::create_dir_all(data_dir)?;
    let target = data_dir.join("cfitness_state.json");
    let tmp = data_dir.join("cfitness_state.json.tmp");
    let payload = serde_json::to_string_pretty(state)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(&tmp, payload)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_initial_state_has_no_fictive_operational_data() {
        let state = create_production_initial_state();
        assert_eq!(state.sites.len(), 2);
        assert!(state.sites.iter().all(|s| !s.name.contains("Fictif")));
        assert!(!state.organization.name.contains("Fictif"));
        assert_eq!(state.employees.len(), 1);
        assert!(state.employees[0].active);
        assert_eq!(state.employees[0].site_accesses.len(), 2);
        assert!(state.employees[0]
            .site_accesses
            .iter()
            .all(|a| a.profile_id == "admin_systeme"));
        assert_eq!(state.profiles.len(), 6);
        assert!(state.shifts.is_empty());
        assert!(state.leave_requests.is_empty());
        assert!(state.anomalies.is_empty());
        assert!(state.kpis.is_empty());
        assert!(state.audit_log.is_empty());
        assert!(state.lead_forms.is_empty());
        assert!(state.lead_prospects.is_empty());
        assert!(state.lead_appointments.is_empty());
        assert!(state.lead_activities.is_empty());
        assert!(state.recovery_cases.is_empty());
        assert!(state.stock_items.is_empty());
        assert!(state.maintenance_tickets.is_empty());
        assert!(state.lead_settings_by_club.contains_key("carre-de-soie"));
        assert!(state.lead_settings_by_club.contains_key("beynost"));
    }

    #[test]
    fn production_initial_state_accepts_pbkdf2_admin_bootstrap() {
        let mut state = create_production_initial_state();
        let target_id = state.employees[0].id.clone();

        assert!(!apply_admin_password_bootstrap_with(
            &mut state,
            "trop-court",
            &target_id
        ));
        assert!(state.password_hashes_by_employee.is_empty());

        assert!(apply_admin_password_bootstrap_with(
            &mut state,
            "MotDePasseProd2026!",
            &target_id
        ));
        let stored_hash = state
            .password_hashes_by_employee
            .get(&target_id)
            .expect("hash administrateur enregistré");
        assert!(crate::auth_passwords::verify_password_hash(
            "MotDePasseProd2026!",
            stored_hash
        ));
        assert!(!crate::auth_passwords::verify_password_hash(
            "MauvaisMotDePasse!",
            stored_hash
        ));
    }
}
